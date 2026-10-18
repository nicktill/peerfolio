/**
 * What the site says about itself to search engines and link previews. One
 * place, so the page title, the meta description, the social cards and the
 * structured data can't drift apart when the product changes.
 *
 * Keep the description under ~155 characters (Google cuts it there) and make it
 * echo the landing page's own opening copy: Google prefers a description that
 * matches the visible page, and swaps in body text when it doesn't.
 */
export const SITE = {
  name: "Peerfolio",
  title: "Peerfolio",
  /** Link previews and social cards: the site name is shown separately, so no prefix or dash. */
  shareTitle: "Track your money. Race your friends.",
  description:
    "Track your portfolio, race friends on returns, and play fantasy stocks or sports picks with play money. Friends see percentages, not dollars.",
  keywords: [
    "portfolio tracker",
    "social investing",
    "investing with friends",
    "time-weighted return",
    "fantasy investing",
    "play-money sports picks",
    "sports pick leagues",
    "link brokerage account",
    "investment leagues",
  ],
  baseUrl: process.env.NEXTAUTH_URL ?? "https://www.peerfolio.org",
} as const
