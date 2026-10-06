/**
 * Recognises the brokerage or bank a manual account sits at from the name typed
 * in, so the account can wear that firm's mark instead of a generic icon.
 *
 * Firms owned by a listed company borrow that company's icon through the
 * existing logo proxy (`ticker`). Private ones (Fidelity, Vanguard) have no
 * ticker, so they get a monogram tile in their brand colour.
 */
export type Brand = { name: string; ticker?: string; color: string; monogram: string }

const BRANDS: (Brand & { aliases: string[] })[] = [
  { name: "Robinhood", ticker: "HOOD", color: "#00c805", monogram: "R", aliases: ["robinhood"] },
  { name: "Fidelity", color: "#368727", monogram: "F", aliases: ["fidelity", "fidelity investments", "netbenefits"] },
  { name: "Vanguard", color: "#96151d", monogram: "V", aliases: ["vanguard"] },
  { name: "Charles Schwab", ticker: "SCHW", color: "#00a0df", monogram: "S", aliases: ["schwab", "charles schwab", "td ameritrade", "ameritrade"] },
  { name: "Interactive Brokers", ticker: "IBKR", color: "#d81222", monogram: "IB", aliases: ["interactive brokers", "ibkr"] },
  { name: "E*TRADE", ticker: "MS", color: "#6633cc", monogram: "E", aliases: ["etrade", "e trade", "morgan stanley"] },
  { name: "SoFi", ticker: "SOFI", color: "#00a2c7", monogram: "S", aliases: ["sofi", "sofi invest"] },
  { name: "Coinbase", ticker: "COIN", color: "#0052ff", monogram: "C", aliases: ["coinbase"] },
  { name: "Merrill", ticker: "BAC", color: "#0060a9", monogram: "M", aliases: ["merrill", "merrill edge", "merrill lynch", "bank of america", "bofa"] },
  { name: "J.P. Morgan", ticker: "JPM", color: "#117aca", monogram: "J", aliases: ["chase", "jpmorgan", "jp morgan", "j p morgan", "jpmorgan chase"] },
  { name: "Wells Fargo", ticker: "WFC", color: "#d71e28", monogram: "W", aliases: ["wells fargo"] },
  { name: "Ally", ticker: "ALLY", color: "#650360", monogram: "A", aliases: ["ally", "ally invest", "ally bank"] },
  { name: "Capital One", ticker: "COF", color: "#004977", monogram: "C", aliases: ["capital one", "capitalone"] },
  { name: "American Express", ticker: "AXP", color: "#016fd0", monogram: "A", aliases: ["american express", "amex"] },
  { name: "Goldman Sachs", ticker: "GS", color: "#7399c6", monogram: "G", aliases: ["goldman sachs", "marcus"] },
  { name: "Citi", ticker: "C", color: "#003b70", monogram: "C", aliases: ["citi", "citibank", "citigroup"] },
  { name: "U.S. Bank", ticker: "USB", color: "#0c2074", monogram: "U", aliases: ["us bank", "u s bank", "usbank"] },
  { name: "Webull", color: "#1e6cf0", monogram: "W", aliases: ["webull"] },
  { name: "Public", color: "#111111", monogram: "P", aliases: ["public", "public com"] },
  { name: "Empower", color: "#00296b", monogram: "E", aliases: ["empower", "empower retirement", "personal capital"] },
  { name: "Betterment", color: "#1f4fe0", monogram: "B", aliases: ["betterment"] },
  { name: "Wealthfront", color: "#4840bb", monogram: "W", aliases: ["wealthfront"] },
  { name: "Acorns", color: "#7ac143", monogram: "A", aliases: ["acorns"] },
  { name: "TIAA", color: "#00447c", monogram: "T", aliases: ["tiaa"] },
  { name: "Principal", ticker: "PFG", color: "#0091da", monogram: "P", aliases: ["principal", "principal financial"] },
  { name: "M1", color: "#1b1b1b", monogram: "M1", aliases: ["m1", "m1 finance"] },
]

const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()

/** The brand for an institution name, or null when it isn't one we recognise. */
export function brandFor(institution: string | null | undefined): Brand | null {
  if (!institution) return null
  const text = normalize(institution)
  if (!text) return null
  // Whole-word match, so "Public" doesn't catch "Republic Bank" and "Citi" doesn't catch "Citizens".
  const words = ` ${text} `
  const found = BRANDS.find((b) => b.aliases.some((a) => words.includes(` ${a} `)))
  return found ? { name: found.name, ticker: found.ticker, color: found.color, monogram: found.monogram } : null
}
