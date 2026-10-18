"use client"

import { useState } from "react"
import { ArrowDownUp, Lock } from "lucide-react"
import { Delta } from "@web/components/ui/delta"
import { CastAvatar } from "@web/components/landing/cast-avatar"
import { CAST } from "@web/components/landing/demo"
import { onColor, teamLook } from "@web/lib/sports/teams"
import "@web/components/landing/play-preview.css"

const usd = (v: number) => `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const odds = (n: number) => (n > 0 ? `+${n}` : `${n}`)
/** Profit on a stake at American odds. */
const toWin = (stake: number, o: number) => (o > 0 ? (stake * o) / 100 : (stake * 100) / -o)

/** Team logo from the same source the app uses, with a team-coloured initials disc if it does not load. */
function Mark({ name, size = 36 }: { name: string; size?: number }) {
  const look = teamLook("nfl", name)
  const [failed, setFailed] = useState(false)
  const bare = !failed && look.logo
  return (
    <span className="pp-mark" aria-hidden style={{ width: size, height: size, background: bare ? "transparent" : look.color, color: onColor(look.color), fontSize: size * 0.3 }}>
      {bare ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="pp-l" src={look.logo!} alt="" width={size} height={size} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
          {look.logoDark ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="pp-d" src={look.logoDark} alt="" width={size} height={size} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
          ) : null}
        </>
      ) : look.abbr}
    </span>
  )
}

const SIDES = [
  { team: "Philadelphia Eagles", short: "Eagles", abbr: "PHI", odds: -110 },
  { team: "Dallas Cowboys", short: "Cowboys", abbr: "DAL", odds: 120 },
] as const

/** The Play tab: stock fantasy leagues on one side, play-money sports picks on the other. */
export function PlayPreview() {
  const [side, setSide] = useState<0 | 1>(1)
  const [stake, setStake] = useState(50)
  const pick = SIDES[side]
  return (
    <div className="pp" aria-label="Stock leagues and sports picks preview">
      <div className="pp-grid">
        <section className="pf-panel pf-lift pp-panel" aria-label="Stock leagues">
          <div className="pf-ph"><h3 className="pf-label">Stock leagues</h3><span className="pf-ph-end pf-sample">Play money</span></div>
          <div className="pp-body">
            <div className="pp-seg" aria-hidden><span data-on>Buy</span><span>Sell</span></div>
            <div className="pp-field"><span><small>Stock</small><br /><b>NVDA</b></span><small className="numeric">{usd(124.5)}</small></div>
            <div className="pp-field"><span><small>Shares</small><br /><b className="numeric">12</b></span><small className="numeric">{usd(12 * 124.5)}</small></div>
            <span className="pp-cta"><ArrowDownUp className="size-4" aria-hidden />Buy NVDA</span>
            <div className="pp-sep" />
            <p className="pf-label-plain">Standings</p>
            <ul className="divide-y" style={{ margin: "-4px 0 0" }}>
              {[CAST[0]!, CAST[2]!, CAST[4]!].map((m, i) => (
                <li key={m.id} className="pp-row py-2.5">
                  <span className="pp-rank">{i + 1}</span>
                  <CastAvatar member={m} size={28} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{m.name}</span>
                  <Delta value={[5.4, 2.1, -1.8][i]!} variant="plain" />
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="pf-panel pf-lift pp-panel" aria-label="Sports picks">
          <div className="pf-ph"><h3 className="pf-label">Sports picks</h3><span className="pf-ph-end pf-sample">Play money · real games</span></div>
          <div className="pp-body">
            <p className="pf-label-plain">NFL · Sun 4:25 PM</p>
            <div className="pp-game">
              <div className="pp-team"><Mark name={SIDES[0].team} size={40} /><span>{SIDES[0].short}</span></div>
              <span className="pp-vs">at</span>
              <div className="pp-team"><Mark name={SIDES[1].team} size={40} /><span>{SIDES[1].short}</span></div>
            </div>
            <div className="pp-odds" role="group" aria-label="Moneyline">
              {SIDES.map((s, i) => (
                <button key={s.abbr} type="button" aria-pressed={side === i} onClick={() => setSide(i as 0 | 1)}>
                  <i>{s.abbr} · moneyline</i><b>{odds(s.odds)}</b>
                </button>
              ))}
            </div>
            <div className="pp-slip" aria-live="polite">
              <div className="pp-slip-line"><span>Your pick</span><b>{pick.short} {odds(pick.odds)}</b></div>
              <div className="pp-chips" role="group" aria-label="Stake in play money">
                {[25, 50, 100].map((v) => <button key={v} type="button" aria-pressed={stake === v} onClick={() => setStake(v)}>${v}</button>)}
              </div>
              <div className="pp-slip-line"><span>To win</span><span className="pp-win">{usd(toWin(stake, pick.odds))}</span></div>
            </div>

            <div className="pp-live">
              <div className="pp-live-head"><span className="pp-dot" aria-hidden /><p className="pf-label-plain">Live · Q3 4:12</p><span className="pf-sample ml-auto">Chiefs pick</span></div>
              <div className="pp-score">
                <span className="pp-row"><Mark name="Kansas City Chiefs" size={26} /><b className="numeric">20</b></span>
                <span className="pp-row"><b className="numeric">17</b><Mark name="Buffalo Bills" size={26} /></span>
              </div>
              <div className="pp-bar" role="img" aria-label="Chiefs win chance 62 percent"><div className="pp-bar-fill" style={{ width: "62%" }} /></div>
              <div className="pp-bar-legend"><span>KC 62%</span><span>BUF 38%</span></div>
            </div>

            <div>
              <p className="pf-label-plain flex items-center gap-1.5"><Lock className="size-3" aria-hidden />Locked picks</p>
              <ul className="mt-1">
                <li className="pp-pick"><CastAvatar member={CAST[1]!} size={24} /><span className="min-w-0 truncate">You · Chiefs −135</span><span className="pp-tag" data-up>Winning</span></li>
                <li className="pp-pick"><CastAvatar member={CAST[0]!} size={24} /><span className="min-w-0 truncate">Theo · Bills +115</span><span className="pp-tag">Trailing</span></li>
              </ul>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
