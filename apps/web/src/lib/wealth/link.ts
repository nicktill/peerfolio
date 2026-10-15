/**
 * Wealth Lab links: WealthInputs <-> URL search params. Pure, no I/O.
 *
 * The decoder treats the query string as untrusted. Each field is parsed strictly, then clamped; a field that
 * isn't a plain finite number is dropped (not zeroed), and unknown params are ignored.
 */
import { MAX_YEARS, type WealthInputs } from "./engine.ts"

export const WEALTH_PATH = "/wealth"
export const MAX_MONEY = 1e9
export const MAX_RATE_PCT = 30
export const MAX_SPREAD = 10

export type LinkInputs = WealthInputs & { spread?: number }
/** What a link carried: only the fields that were present and valid. */
export type LinkOverrides = Partial<Omit<LinkInputs, "targetValue">> & { targetValue?: number }

type Field = { key: keyof LinkOverrides; max: number }
const FIELDS: Field[] = [
  { key: "startingValue", max: MAX_MONEY },
  { key: "monthlyContribution", max: MAX_MONEY },
  { key: "annualContributionGrowthPct", max: MAX_RATE_PCT },
  { key: "years", max: MAX_YEARS },
  { key: "expectedAnnualReturnPct", max: MAX_RATE_PCT },
  { key: "inflationPct", max: MAX_RATE_PCT },
  { key: "targetValue", max: MAX_MONEY },
  { key: "spread", max: MAX_SPREAD },
]

const NUMBER = /^\d{1,12}(\.\d{1,6})?$/

const clamp = (n: number, max: number) => Math.min(max, Math.max(0, n))
const round = (n: number) => Math.round(n * 1e6) / 1e6

/** Search params for a set of assumptions (no leading "?"). Values are clamped the same way the decoder does. */
export function encodeWealthParams(input: LinkInputs): string {
  const params = new URLSearchParams()
  const values = input as Record<string, number | null | undefined>
  for (const { key, max } of FIELDS) {
    const v = values[key]
    if (typeof v === "number" && Number.isFinite(v)) params.set(key, String(round(clamp(v, max))))
  }
  return params.toString()
}

/** A same-origin relative Wealth Lab URL. */
export function wealthLabUrl(input: LinkInputs): string {
  const q = encodeWealthParams(input)
  return q ? `${WEALTH_PATH}?${q}` : WEALTH_PATH
}

/** The valid, clamped fields in `search`, or null when there are none. Never throws. */
export function decodeWealthParams(search: string | URLSearchParams): LinkOverrides | null {
  let params: URLSearchParams
  try {
    params = typeof search === "string" ? new URLSearchParams(search) : search
  } catch {
    return null
  }
  const out: Record<string, number> = {}
  for (const { key, max } of FIELDS) {
    const raw = params.get(key)
    if (raw == null) continue
    const text = raw.trim()
    if (!NUMBER.test(text)) continue
    const n = Number(text)
    if (Number.isFinite(n)) out[key] = clamp(n, max)
  }
  return Object.keys(out).length > 0 ? (out as LinkOverrides) : null
}

/** True for a Wealth Lab link that is relative and same-origin ("/wealth" or "/wealth?..."), nothing else. */
export function isWealthHref(href: unknown): href is string {
  if (typeof href !== "string" || href.length > 600) return false
  if (!(href === WEALTH_PATH || href.startsWith(`${WEALTH_PATH}?`))) return false
  return !/[\\\s\u0000-\u001f]/.test(href) && !href.includes("//") && !href.includes("#")
}
