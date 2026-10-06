/**
 * Placeholder content for the News page while its data sources are chosen.
 * Every number, story and date here is illustrative, and the page says so.
 * Swap this module for an API response with the same shape.
 */

export type Period = "day" | "week"

export type Move = { percent: number; points: number; path: number[] }

export type IndexQuote = {
  key: string
  name: string
  /** The fund that tracks the index, when the numbers are the fund's (the live data). */
  symbol?: string
  price: number
  /** Percent change, then point change, then the path as percent from the start. */
  day: Move
  /** Null when there aren't enough daily bars to measure the week honestly. */
  week: Move | null
}

/** [sector, day %, week % (null when unknown)]. */
export type SectorMove = [string, number, number | null]

export type Recap = {
  title: string
  stamp: string
  headline: string
  body: string
  takeaways: { title: string; body: string }[]
}

export type EarningsReport = {
  symbol: string
  name: string
  when: "before-open" | "after-close" | "during" | "unknown"
  epsEstimate: string
  /** Whether the company has confirmed the date. Only the sample knows; the live calendar doesn't say. */
  confirmed?: boolean
  owned: boolean
}

export type EarningsDay = { dow: string; label: string; date: number; iso?: string; past?: boolean; today?: boolean; reports: EarningsReport[] }

export const INDEXES: IndexQuote[] = [
  {
    key: "spx",
    name: "S&P 500",
    price: 6742.18,
    day: { percent: 0.42, points: 28.19, path: [0, -0.08, 0.05, 0.12, 0.06, 0.18, 0.25, 0.21, 0.3, 0.27, 0.35, 0.33, 0.4, 0.38, 0.42] },
    week: { percent: 1.18, points: 78.62, path: [0, 0.22, 0.15, 0.41, 0.58, 0.49, 0.72, 0.66, 0.9, 0.84, 1.02, 1.1, 1.18] },
  },
  {
    key: "ndx",
    name: "Nasdaq",
    price: 22914.6,
    day: { percent: 0.71, points: 161.55, path: [0, -0.12, 0.02, 0.18, 0.1, 0.29, 0.4, 0.36, 0.52, 0.48, 0.6, 0.57, 0.66, 0.69, 0.71] },
    week: { percent: 1.94, points: 436.08, path: [0, 0.35, 0.21, 0.62, 0.9, 0.78, 1.15, 1.04, 1.42, 1.36, 1.7, 1.82, 1.94] },
  },
  {
    key: "dji",
    name: "Dow Jones",
    price: 46620.35,
    day: { percent: -0.12, points: -56.01, path: [0, 0.06, 0.1, 0.02, -0.05, 0.04, -0.02, -0.1, -0.06, -0.14, -0.09, -0.15, -0.1, -0.13, -0.12] },
    week: { percent: 0.48, points: 222.73, path: [0, 0.12, -0.05, 0.18, 0.3, 0.14, 0.26, 0.4, 0.33, 0.5, 0.42, 0.45, 0.48] },
  },
  {
    key: "rut",
    name: "Russell 2000",
    price: 2481.07,
    day: { percent: -0.58, points: -14.48, path: [0, 0.1, -0.04, -0.12, -0.08, -0.22, -0.3, -0.26, -0.38, -0.44, -0.4, -0.5, -0.55, -0.52, -0.58] },
    week: { percent: -0.36, points: -8.96, path: [0, 0.2, 0.32, 0.1, -0.08, 0.04, -0.2, -0.12, -0.3, -0.22, -0.41, -0.3, -0.36] },
  },
]

export const RECAPS: Record<Period, Recap> = {
  day: {
    title: "Daily recap",
    stamp: "Updated 4:20 PM ET",
    headline: "Chipmakers lead a quiet, upward session",
    body: "Stocks edged higher as semiconductors and large-cap tech rallied, lifting the Nasdaq more than the broader market. Small caps lagged and energy fell with oil.\n\nChipmakers led after an upbeat demand outlook from a major supplier, while software trailed for a second day. Bond yields were little changed ahead of Thursday’s jobless claims.",
    takeaways: [
      { title: "Tech carried the market", body: "Technology rose 1.24%, the best of 11 sectors." },
      { title: "Energy slipped", body: "The weakest sector, down 1.08% as oil fell." },
      { title: "Earnings warm up", body: "PepsiCo and Delta report Thursday morning." },
    ],
  },
  week: {
    title: "Weekly recap",
    stamp: "Sep 30 – Oct 6",
    headline: "A second straight week of gains, led by growth stocks",
    body: "The Nasdaq added 1.94% over five sessions while the Dow trailed. Rate-sensitive sectors lagged as Treasury yields drifted higher. Next week the big banks open third-quarter earnings season.",
    takeaways: [
      { title: "Growth over value", body: "Nasdaq +1.94% against the Dow at +0.48%." },
      { title: "Energy had a rough week", body: "The sector fell 2.14% as crude slid." },
      { title: "Banks report next", body: "JPMorgan and Wells Fargo are expected Oct 13." },
    ],
  },
}

/** Your holdings' moves, as [symbol, day %, week %]. */
export const HOLDING_MOVES: [string, number, number][] = [
  ["NVDA", 2.31, 4.86],
  ["AAPL", 1.12, 2.04],
  ["PEP", 0.38, -0.92],
  ["XOM", -1.46, -2.71],
  ["TSLA", -1.87, -3.4],
]

export const FEAR_GREED = {
  score: 62,
  history: [
    { label: "Previous close", score: 58 },
    { label: "1 week ago", score: 49 },
    { label: "1 month ago", score: 38 },
    { label: "1 year ago", score: 71 },
  ],
}

export const EARNINGS_WEEK: { label: string; days: EarningsDay[] } = {
  label: "Week of October 5",
  days: [
    { dow: "Mon", label: "Monday, Oct 5", date: 5, past: true, reports: [] },
    {
      dow: "Today",
      label: "Today, Oct 6",
      date: 6,
      today: true,
      reports: [
        { symbol: "MKC", name: "McCormick & Co.", when: "before-open", epsEstimate: "$0.85", confirmed: true, owned: false },
        { symbol: "APLD", name: "Applied Digital", when: "after-close", epsEstimate: "−$0.11", confirmed: false, owned: false },
      ],
    },
    {
      dow: "Wed",
      label: "Wednesday, Oct 7",
      date: 7,
      reports: [
        { symbol: "STZ", name: "Constellation Brands", when: "after-close", epsEstimate: "$3.38", confirmed: true, owned: true },
        { symbol: "LEVI", name: "Levi Strauss & Co.", when: "after-close", epsEstimate: "$0.31", confirmed: false, owned: false },
      ],
    },
    {
      dow: "Thu",
      label: "Thursday, Oct 8",
      date: 8,
      reports: [
        { symbol: "PEP", name: "PepsiCo", when: "before-open", epsEstimate: "$2.26", confirmed: true, owned: true },
        { symbol: "DAL", name: "Delta Air Lines", when: "before-open", epsEstimate: "$1.52", confirmed: true, owned: true },
        { symbol: "CAG", name: "Conagra Brands", when: "before-open", epsEstimate: "$0.41", confirmed: false, owned: false },
      ],
    },
    { dow: "Fri", label: "Friday, Oct 9", date: 9, reports: [] },
  ],
}

/** S&P 500 sectors as [name, day %, week %]. */
export const SECTORS: SectorMove[] = [
  ["Technology", 1.24, 2.81],
  ["Communication", 0.88, 1.92],
  ["Consumer disc.", 0.52, 1.1],
  ["Financials", 0.31, 0.64],
  ["Industrials", 0.18, 0.42],
  ["Health care", -0.21, 0.35],
  ["Materials", -0.05, -0.22],
  ["Utilities", -0.73, -0.48],
  ["Consumer staples", -0.44, -0.81],
  ["Real estate", -0.62, -1.05],
  ["Energy", -1.08, -2.14],
]
