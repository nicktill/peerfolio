// Shared by `scripts/seed.ts` and the preview login bootstrap. Pure data: no imports, so a plain Node script can load it.

/** Deterministic PRNG, so re-seeding produces the same portfolios every time. */
export function makeRandom(seed: number) {
  let state = seed
  return () => ((state = (state * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
}

export const DEMO_PEOPLE = [
  { handle: "nick", name: "Nick Tillmann", drift: 0.0016, volatility: 0.01, bio: "Index funds and patience." },
  { handle: "maya", name: "Maya Chen", drift: 0.0024, volatility: 0.014, bio: "Concentrated in what I understand." },
  { handle: "deshawn", name: "DeShawn Ellis", drift: 0.0009, volatility: 0.006, bio: "Boring on purpose." },
  { handle: "priya", name: "Priya Raman", drift: 0.0031, volatility: 0.021, bio: "High conviction, high variance." },
  { handle: "sam", name: "Sam Okafor", drift: 0.0019, volatility: 0.009, bio: "Three funds and a nap." },
]

export const SECURITIES = [
  { id: "demo-vti", tickerSymbol: "VTI", name: "Vanguard Total Stock Market ETF", type: "etf" },
  { id: "demo-vxus", tickerSymbol: "VXUS", name: "Vanguard Total International Stock ETF", type: "etf" },
  { id: "demo-bnd", tickerSymbol: "BND", name: "Vanguard Total Bond Market ETF", type: "fixed_income" },
  { id: "demo-nvda", tickerSymbol: "NVDA", name: "NVIDIA Corporation", type: "equity" },
  { id: "demo-aapl", tickerSymbol: "AAPL", name: "Apple Inc.", type: "equity" },
  { id: "demo-msft", tickerSymbol: "MSFT", name: "Microsoft Corporation", type: "equity" },
]

export const MIXES: Record<string, [string, number][]> = {
  nick: [["demo-vti", 21400], ["demo-vxus", 8200], ["demo-bnd", 5100], ["demo-nvda", 4300], ["demo-aapl", 2600]],
  maya: [["demo-nvda", 19800], ["demo-msft", 11200], ["demo-aapl", 7400], ["demo-vti", 5100]],
  deshawn: [["demo-vti", 28000], ["demo-bnd", 14000]],
  priya: [["demo-nvda", 26500], ["demo-aapl", 9100], ["demo-msft", 4200]],
  sam: [["demo-vti", 16000], ["demo-vxus", 9400], ["demo-msft", 6100]],
}

export const DAYS = 120
