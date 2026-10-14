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
  title: "Peerfolio — Track your portfolio. Invest with friends.",
  description:
    "Track your portfolio, compare returns in private leagues, and play fantasy investing with friends. Your account balances stay private.",
  baseUrl: process.env.NEXTAUTH_URL ?? "https://www.peerfolio.org",
} as const
