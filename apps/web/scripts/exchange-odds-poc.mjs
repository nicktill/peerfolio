// READ-ONLY proof of concept: exchange-implied win probability for upcoming/live NFL + NBA games.
// Spine = ESPN scoreboard (teams, start time, state, score). Kalshi + Polymarket are matched onto it by
// team names and start time, and we print mid, bid/ask and data age. Unauthenticated public endpoints only,
// no keys, no DB, no writes. Bounded: ~2 ESPN + 2 Kalshi events + 2 Polymarket events + a few per-game
// freshness calls (capped by --games, default 2 per sport).
//
//   node scripts/exchange-odds-poc.mjs [--games 2] [--sports nfl,nba]
//
// Data age caveats (verified Oct 17 2026): Kalshi market `updated_time` can be weeks stale even when
// the book is live, so freshness here comes from the last trade timestamp (Kalshi) and the CLOB book
// timestamp (Polymarket). Neither is "age of the quote" with certainty; a WebSocket is the real answer.
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i === -1 ? d : process.argv[i + 1] ?? d }
const maxGames = Number(arg("games", "2"))
const sports = arg("sports", "nfl,nba").split(",")

const CFG = {
  nfl: { espn: "football/nfl", kalshiSeries: "KXNFLGAME", pmSeries: "12185" },
  nba: { espn: "basketball/nba", kalshiSeries: "KXNBAGAME", pmSeries: "10345" },
}
let requests = 0
async function getJson(url) {
  requests++
  const res = await fetch(url, { headers: { "user-agent": "peerfolio-exchange-poc/0.1", accept: "application/json" }, signal: AbortSignal.timeout(15000) })
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  return res.json()
}
const norm = (s) => s.toLowerCase().replace(/[^a-z ]/g, "").trim()
const ageS = (iso) => (iso ? Math.round((Date.now() - new Date(iso).getTime()) / 1000) : null)
const fmtAge = (s) => (s == null ? "n/a" : s < 120 ? `${s}s` : s < 7200 ? `${Math.round(s / 60)}m` : s < 172800 ? `${Math.round(s / 3600)}h` : `${Math.round(s / 86400)}d`)
const pct = (x) => (x == null || Number.isNaN(x) ? "  n/a" : `${(x * 100).toFixed(1)}%`.padStart(6))

async function main() {
  console.log(`# exchange-odds-poc  now=${new Date().toISOString()}`)
  for (const sport of sports) {
    const cfg = CFG[sport]
    const [board, kal, pm] = await Promise.all([
      getJson(`https://site.api.espn.com/apis/site/v2/sports/${cfg.espn}/scoreboard`),
      getJson(`https://api.elections.kalshi.com/trade-api/v2/events?series_ticker=${cfg.kalshiSeries}&status=open&with_nested_markets=true&limit=50`),
      getJson(`https://gamma-api.polymarket.com/events?series_id=${cfg.pmSeries}&active=true&closed=false&limit=50&order=startDate&ascending=true`),
    ])
    // prefer live, then soonest pre games; skip finished
    const games = board.events
      .filter((e) => e.status.type.state !== "post")
      .sort((a, b) => (a.status.type.state === "in" ? -1 : 0) - (b.status.type.state === "in" ? -1 : 0) || new Date(a.date) - new Date(b.date))
    console.log(`\n== ${sport.toUpperCase()}: ESPN ${board.events.length} events (${games.length} not final), Kalshi ${kal.events.length} open game events, Polymarket ${pm.length} events`)
    let shown = 0
    for (const g of games) {
      if (shown >= maxGames) break
      const c = g.competitions[0]
      const home = c.competitors.find((x) => x.homeAway === "home").team
      const away = c.competitors.find((x) => x.homeAway === "away").team
      // Kalshi: event title "Boston vs Detroit" (away vs home); match on city/name inside ESPN displayName.
      const inName = (team, label) => norm(team.displayName).includes(norm(label))
      const kEv = kal.events.find((ev) => {
        // NBA titles are "Boston vs Detroit"; NFL titles are "HOU Texans vs JAC Jaguars" (strip the abbr token).
        const [a, h] = ev.title.split(/ vs\.? /i).map((x) => x.replace(/^[A-Z]{2,4} (?=\S)/, ""))
        return a && h && inName(away, a) && inName(home, h)
      })
      // Polymarket: slug nfl-sea-den-YYYY-MM-DD or title "Seahawks vs. Broncos"; match nicknames.
      const pEv = pm.find((ev) => {
        const t = norm(ev.title ?? "")
        return t.includes(norm(away.name)) && t.includes(norm(home.name))
      })
      const live = g.status.type.state === "in"
      console.log(`\n${away.abbreviation} @ ${home.abbreviation}  start ${g.date}  espn=${g.status.type.state}${live ? ` ${c.competitors.find((x) => x.homeAway === "away").score}-${c.competitors.find((x) => x.homeAway === "home").score} ${g.status.type.shortDetail}` : ""}  kalshi=${kEv ? "matched" : "NO"}  polymarket=${pEv ? "matched" : "NO"}`)

      if (kEv) {
        // Kalshi: one binary yes-contract per team; yes price == win probability.
        for (const m of kEv.markets) {
          const bid = Number(m.yes_bid_dollars), ask = Number(m.yes_ask_dollars), last = Number(m.last_price_dollars)
          console.log(`  kalshi  ${m.yes_sub_title.padEnd(14)} bid ${pct(bid)} ask ${pct(ask)} mid ${pct((bid + ask) / 2)} last ${pct(last)}  vol ${m.volume_fp}  market.updated_time age ${fmtAge(ageS(m.updated_time))} (unreliable)  ${m.ticker}`)
        }
        const home0 = kEv.markets[0]
        try {
          const t = await getJson(`https://api.elections.kalshi.com/trade-api/v2/markets/trades?ticker=${home0.ticker}&limit=1`)
          const tr = t.trades?.[0]
          console.log(`  kalshi  last-trade age ${tr ? fmtAge(ageS(tr.created_time)) : "no trades"}${tr ? ` (price ${tr.yes_price_dollars})` : ""}  [freshness proxy]`)
        } catch (e) { console.log(`  kalshi trades error ${e.message}`) }
      }
      if (pEv) {
        const mk = pEv.markets.find((m) => m.sportsMarketType === "moneyline") ?? pEv.markets[0]
        const outcomes = JSON.parse(mk.outcomes), tokens = JSON.parse(mk.clobTokenIds)
        console.log(`  polymkt moneyline "${mk.question}" acceptingOrders=${mk.acceptingOrders} event.live=${pEv.live ?? "n/a"} score=${pEv.score ?? "n/a"} period=${pEv.period ?? "n/a"} gamma.updatedAt age ${fmtAge(ageS(mk.updatedAt))}`)
        try {
          // CLOB book per outcome token: has its own `timestamp` (ms epoch) = book snapshot time.
          const book = await getJson(`https://clob.polymarket.com/book?token_id=${tokens[0]}`)
          const bb = Math.max(...book.bids.map((x) => Number(x.price)), -Infinity)
          const ba = Math.min(...book.asks.map((x) => Number(x.price)), Infinity)
          const ok = Number.isFinite(bb) && Number.isFinite(ba)
          console.log(`  polymkt ${outcomes[0].padEnd(14)} bid ${pct(ok ? bb : NaN)} ask ${pct(ok ? ba : NaN)} mid ${pct(ok ? (bb + ba) / 2 : NaN)} last ${pct(Number(book.last_trade_price))}  book.timestamp age ${fmtAge(ageS(new Date(Number(book.timestamp)).toISOString()))}  depth bids/asks ${book.bids.length}/${book.asks.length}`)
        } catch (e) { console.log(`  polymkt book error ${e.message}`) }
        const kinds = {}
        for (const m of pEv.markets) kinds[m.sportsMarketType] = (kinds[m.sportsMarketType] ?? 0) + 1
        console.log(`  polymkt market types on this event: ${JSON.stringify(kinds)}`)
      }
      shown++
    }
  }
  console.log(`\n# total HTTP requests: ${requests}`)
}
main().catch((e) => { console.error(e); process.exit(1) })
