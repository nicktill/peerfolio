/**
 * What each tool is doing, in the words shown while it runs ("Comparing with the S&P 500"). One calm line per
 * step, so a slow turn with several tools reads as a short plan being carried out instead of a stalled spinner.
 */

const BENCH: Record<string, string> = { SPY: "the S&P 500", QQQ: "the Nasdaq 100", VTI: "the US total market" }

const LABELS: Record<string, string> = {
  get_current_view: "Looking at your screen",
  get_portfolio_xray: "Running the portfolio X-Ray",
  show_figure: "Drawing a figure",
  get_holdings: "Reading your holdings",
  get_league_standings: "Reading the standings",
  get_fantasy_league: "Reading your fantasy league",
  get_market_news: "Reading today's headlines",
  get_market_snapshot: "Checking the market",
  get_quotes: "Pulling live quotes",
  get_top_movers: "Scanning today's biggest movers",
  get_earnings_calendar: "Checking the earnings calendar",
  project_wealth: "Running the projection",
}

export function toolLabel(name: string, rawArgs = "{}"): string | undefined {
  if (name === "compare_to_benchmark") {
    try {
      const symbol = String((JSON.parse(rawArgs) as { symbol?: unknown }).symbol ?? "").toUpperCase()
      return `Comparing with ${BENCH[symbol] ?? "the benchmark"}`
    } catch {
      return "Comparing with the benchmark"
    }
  }
  if (name === "get_quotes") {
    try {
      const symbols = (JSON.parse(rawArgs) as { symbols?: unknown }).symbols
      if (Array.isArray(symbols) && symbols.length > 0 && symbols.length <= 3 && symbols.every((s) => typeof s === "string" && /^[A-Za-z.\-]{1,6}$/.test(s))) return `Pulling quotes for ${symbols.map((s) => String(s).toUpperCase()).join(", ")}`
    } catch {
      // Fall through to the general label.
    }
  }
  return LABELS[name]
}
