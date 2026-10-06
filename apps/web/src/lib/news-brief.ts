import type OpenAI from "openai"
import { latestCompletedSession, regularSession } from "./market-hours.ts"

/**
 * The daily and weekly market recap, written by a small model from stored
 * headlines only. The model is an editor, not a researcher: it gets numbered
 * items, must cite the ones it uses, and may only use numbers that appear in
 * them. A draft that breaks those rules is sent back once with the problems
 * listed; after that, a plain recap built from the headlines themselves is
 * published instead. Nothing unchecked reaches the page.
 */

export type BriefPeriod = "day" | "week"

export type BriefItem = { id: string; source: string; title: string; url: string; summary: string | null; publishedAt: Date }

export type Brief = {
  headline: string
  body: string
  takeaways: { title: string; body: string; sourceIds: string[] }[]
  sourceIds: string[]
}

export type BriefResult = {
  brief: Brief
  /** True when the model's draft wasn't used (no key, over budget, failed checks or an error). */
  fallback: boolean
  problems: string[]
  inputTokens: number
  outputTokens: number
  costUsd: number
}

export const NEWS_MODEL = process.env.NEWS_AI_MODEL || "gpt-5-mini"
/** Dollars per million tokens, for the spend ledger. Defaults are GPT-5 mini's list prices. */
const INPUT_PER_M = Number(process.env.NEWS_AI_INPUT_PER_M) || 0.25
const OUTPUT_PER_M = Number(process.env.NEWS_AI_OUTPUT_PER_M) || 2

export const costOf = (inputTokens: number, outputTokens: number) => (inputTokens * INPUT_PER_M + outputTokens * OUTPUT_PER_M) / 1_000_000

/** Hard cap on what one attempt may write (reasoning included). */
export const MAX_OUTPUT_TOKENS = 4000
/** Longest title or summary that reaches the prompt, so its size (and cost) is bounded. */
export const MAX_ITEM_TEXT = 300

/** Most input tokens one attempt may send, by the bound below. Prompts over it drop their oldest stories. */
export const MAX_INPUT_TOKENS = 40_000
/** Allowance for the request's framing (roles, message separators, format wrapper), in tokens. */
const REQUEST_OVERHEAD_TOKENS = 512

const utf8 = new TextEncoder()
const bytes = (text: string) => utf8.encode(text).length

/**
 * A hard upper bound on an attempt's input tokens, with no tokenizer: OpenAI's
 * byte-level BPE never makes more tokens than the text has UTF-8 bytes, so the
 * byte count of everything sent (instructions, prompt, response schema) plus a
 * framing allowance can't be exceeded in any language.
 */
export const inputTokenBound = (input: string) =>
  bytes(SYSTEM) + bytes(input) + bytes(JSON.stringify(BRIEF_SCHEMA)) + REQUEST_OVERHEAD_TOKENS

/** The most one attempt can cost: the input bound plus the full output cap, at the configured prices. */
export const worstCaseUsd = (input: string) => costOf(inputTokenBound(input), MAX_OUTPUT_TOKENS)

/** Retry feedback is capped so a retry's prompt stays inside the input limit too. */
const FEEDBACK_ROOM = 4000
const feedbackText = (problems: string[]) =>
  `\n\nYour previous draft had these problems. Fix all of them:\n- ${problems
    .slice(0, 8)
    .map((p) => p.slice(0, 300))
    .join("\n- ")}`.slice(0, FEEDBACK_ROOM)

/**
 * Where spend is reserved before each attempt and settled after it. `reserve`
 * returns an id, or null when the month's budget can't cover the attempt.
 */
export type SpendLedger = {
  reserve: (usd: number) => Promise<string | null>
  settle: (id: string, actual: { inputTokens: number; outputTokens: number; costUsd: number }) => Promise<void>
}

const normalizeTitle = (t: string) =>
  t
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, "")
    .slice(0, 60)

/** Newest first within the window, near-duplicate headlines dropped, numbered s1, s2, … */
export function selectItems(
  items: Omit<BriefItem, "id">[],
  { from, to, max }: { from: Date; to: Date; max: number },
): BriefItem[] {
  const seen = new Set<string>()
  return items
    .filter((i) => i.publishedAt >= from && i.publishedAt <= to)
    .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
    .filter((i) => {
      const key = normalizeTitle(i.title)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, max)
    .map((i, n) => ({ ...i, id: `s${n + 1}` }))
}

const timeEt = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", hour: "numeric", minute: "2-digit" })
const dayEt = (date: string) =>
  new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(new Date(`${date}T16:00:00Z`))

export function promptInput(period: BriefPeriod, sessionDate: string, items: BriefItem[]) {
  const header =
    period === "day" ? `Period: the US trading day of ${dayEt(sessionDate)}.` : `Period: the US trading week ending ${dayEt(sessionDate)}.`
  const clip = (t: string) => (t.length > MAX_ITEM_TEXT ? `${t.slice(0, MAX_ITEM_TEXT)}…` : t)
  const lines = items.map((i) => `[${i.id}] ${i.source} · ${timeEt.format(i.publishedAt)} ET — ${clip(i.title)}${i.summary ? `. ${clip(i.summary)}` : ""}`)
  return `${header}\n\nNews items:\n${lines.join("\n")}`
}

export const SYSTEM = `You are Peerfolio's markets editor. Write a short, readable, accurate market recap for everyday investors, using ONLY the numbered news items you are given.

Accuracy rules (these matter most):
- Every statement must be supported by the items. Never add facts, figures, prices, causes, quotes or predictions from your own knowledge.
- Use a number only if it appears in the items, written the same way (for example "0.4%" or "$2.1 billion").
- Only explain why something happened if an item gives that explanation, and keep the attribution clear ("as investors weighed…" only when reported).
- If the items do not describe how the broad market moved, do not invent index moves; write about the most important stories that are present.

Style:
- Lead with what mattered most to the overall market (major indexes, interest rates, the economy, big movers), then notable company news.
- Plain English, specific and interesting. Explain jargon briefly. No hype, no exclamation marks, no investment advice.
- headline: one specific sentence-case line, at most 90 characters.
- body: 2 to 4 sentences, at most 600 characters.
- takeaways: exactly 3. Each has a 2 to 5 word title and one sentence of at most 180 characters, plus the ids of the items it relies on.
- sourceIds: the ids of every item the headline and body rely on.`

export const BRIEF_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["headline", "body", "takeaways", "sourceIds"],
  properties: {
    headline: { type: "string" },
    body: { type: "string" },
    takeaways: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "body", "sourceIds"],
        properties: { title: { type: "string" }, body: { type: "string" }, sourceIds: { type: "array", items: { type: "string" } } },
      },
    },
    sourceIds: { type: "array", items: { type: "string" } },
  },
} as const

export type Claim = { value: string; unit: string; money: boolean; direction: "up" | "down" | null; raw: string }

const UNITS: [RegExp, string][] = [
  [/^(%|percent|per cent)$/i, "%"],
  [/^(bps|basis points?)$/i, "bp"],
  [/^(points?|pts)$/i, "pt"],
  [/^(million|mn|m)$/i, "m"],
  [/^(billion|bn|b)$/i, "b"],
  [/^(trillion|tn|t)$/i, "t"],
]
const UP = /\b(up|rose|rise|rises|rising|gain|gains|gained|climb|climbs|climbed|jump|jumps|jumped|rall(?:y|ied|ies)|surge|surged|surges|advance|advanced|added|higher|soar|soared|increase|increased|grew|beat)\b/i
const DOWN = /\b(down|fell|fall|falls|falling|drop|drops|dropped|slid|slide|slides|slip|slips|slipped|decline|declined|declines|lost|lose|loses|sank|sink|sinks|tumble|tumbled|plunge|plunged|lower|retreat|retreated|decrease|decreased|shed|missed)\b/i

/** The last direction word in a span of text, or null. */
function lastDirection(span: string): "up" | "down" | null {
  let found: { at: number; dir: "up" | "down" } | null = null
  for (const [re, dir] of [[UP, "up"], [DOWN, "down"]] as const) {
    for (const m of span.matchAll(new RegExp(re.source, "gi"))) if (!found || m.index! > found.at) found = { at: m.index!, dir }
  }
  return found?.dir ?? null
}

/** The first direction word in a span of text, or null. */
function firstDirection(span: string): "up" | "down" | null {
  const up = span.search(UP)
  const down = span.search(DOWN)
  if (up === -1 && down === -1) return null
  if (up === -1) return "down"
  if (down === -1) return "up"
  return up < down ? "up" : "down"
}

/**
 * Which way a figure says something moved: its sign first ("-2.3%"), then the
 * nearest direction word before it in the same clause ("fell 2.3%"), then just
 * after it ("2.3% lower").
 */
function directionOf(text: string, start: number, end: number, sign: string | undefined): "up" | "down" | null {
  if (sign === "+") return "up"
  if (sign === "-" || sign === "\u2212") return "down"
  const before = text.slice(Math.max(0, start - 40), start).split(/[.;:!?,]/).pop() ?? ""
  const after = text.slice(end, end + 25).split(/[.;:!?,]/)[0] ?? ""
  return lastDirection(before) ?? firstDirection(after)
}

/**
 * Every figure that makes a claim: its value, unit (%, bp, points, m/b/t),
 * whether it's money, and which way the words around it say it moved. A bare
 * single digit with no unit ("3 takeaways", "Q3") makes no claim and is skipped.
 */
export function claims(text: string): Claim[] {
  const out: Claim[] = []
  // "%" can't end on a word boundary, so it gets its own branch.
  // A leading sign ("-2.3%", "−2.3%", "+0.4%") is kept: it says which way the figure moved.
  const re = /([-+\u2212])?(\$)?\s?(\d[\d,]*(?:\.\d+)?)(?:\s?(%)|\s?(percent|per cent|bps|basis points?|points?|pts|million|billion|trillion|mn|bn|tn)\b|(?<=\d)([mbt])\b)?/gi
  for (const m of text.matchAll(re)) {
    const sign = m[1] && /[\w)]/.test(text[m.index! - 1] ?? "") ? undefined : m[1] // "10-2.3" is a range, not a sign
    const digits = m[3]!.replace(/,/g, "")
    const unitWord = (m[4] ?? m[5] ?? m[6] ?? "").toLowerCase()
    const unit = UNITS.find(([r]) => r.test(unitWord))?.[1] ?? ""
    const money = Boolean(m[2])
    if (!unit && !money && digits.replace(".", "").length < 2) continue
    out.push({ value: String(Number(digits)), unit, money, direction: directionOf(text, m.index!, m.index! + m[0].length, sign), raw: m[0].trim() })
  }
  return out
}

/** Compatibility helper: the values of every claim in a text. */
export function figures(text: string) {
  return claims(text).map((c) => c.value)
}

/**
 * Whether a draft's claim is backed by one of the cited sources: same value,
 * unit and money-ness, and, when the draft says which way it moved, a source
 * that says the same way. A source silent on direction doesn't back a direction.
 */
function supported(claim: Claim, sources: Claim[]) {
  const same = sources.filter((s) => s.value === claim.value && s.unit === claim.unit && s.money === claim.money)
  if (same.length === 0) return "missing" as const
  if (claim.direction && !same.some((s) => s.direction === claim.direction)) return "direction" as const
  return "ok" as const
}

/** What's wrong with a draft, or nothing. Figures are checked against the items each part cites. */
export function checkBrief(brief: Brief, items: BriefItem[], sessionDate: string): string[] {
  const problems: string[] = []
  const byId = new Map(items.map((i) => [i.id, i]))
  const dateClaims = claims(sessionDate.replace(/-/g, " "))

  if (!brief.headline.trim() || brief.headline.length > 110) problems.push("The headline must be present and at most 90 characters.")
  if (!brief.body.trim() || brief.body.length > 700) problems.push("The body must be present and at most 600 characters.")
  if (brief.takeaways.length !== 3) problems.push("Write exactly 3 takeaways.")
  for (const t of brief.takeaways) {
    if (!t.title.trim() || !t.body.trim() || t.body.length > 220) problems.push(`Takeaway "${t.title}" needs a short title and one sentence of at most 180 characters.`)
    if (t.sourceIds.length === 0) problems.push(`Takeaway "${t.title}" must cite the items it relies on.`)
  }
  const cited = [...brief.sourceIds, ...brief.takeaways.flatMap((t) => t.sourceIds)]
  const unknown = cited.filter((id) => !byId.has(id))
  if (unknown.length) problems.push(`These ids are not in the items: ${[...new Set(unknown)].join(", ")}.`)
  if (brief.sourceIds.length === 0) problems.push("List the ids the headline and body rely on in sourceIds.")

  const sourceClaims = (ids: string[]) => [
    ...ids.flatMap((id) => {
      const item = byId.get(id)
      return item ? claims(`${item.title}. ${item.summary ?? ""}`) : []
    }),
    ...dateClaims,
  ]
  const checkPart = (label: string, text: string, ids: string[]) => {
    const sources = sourceClaims(ids)
    for (const claim of claims(text)) {
      const verdict = supported(claim, sources)
      if (verdict === "missing") problems.push(`${label}: "${claim.raw}" does not appear (with that unit) in the items it cites (${ids.join(", ") || "none"}). Use only figures from those items, or cite the item it comes from.`)
      if (verdict === "direction") problems.push(`${label}: "${claim.raw}" is described as moving ${claim.direction}, but the cited items don't say it moved ${claim.direction}. Use the direction they report, or none.`)
    }
  }
  checkPart("Headline", brief.headline, brief.sourceIds)
  checkPart("Body", brief.body, brief.sourceIds)
  for (const t of brief.takeaways) checkPart(`Takeaway "${t.title}"`, `${t.title}. ${t.body}`, t.sourceIds)
  return problems
}

/** A plain recap from the headlines themselves, for when the model's draft can't be used. */
export function fallbackBrief(items: BriefItem[]): Brief {
  const [lead, ...rest] = items
  if (!lead) return { headline: "No market news collected yet", body: "Check back after the close.", takeaways: [], sourceIds: [] }
  const follow = rest.slice(0, 2)
  const sentence = (t: string) => (/[.!?]$/.test(t) ? t : `${t}.`)
  return {
    headline: lead.title.length > 110 ? `${lead.title.slice(0, 107)}…` : lead.title,
    body: [lead.summary ?? lead.title, ...follow.map((i) => i.title)].map(sentence).join(" ").slice(0, 700),
    takeaways: rest.slice(2, 5).map((i) => ({ title: i.source, body: sentence(i.title).slice(0, 220), sourceIds: [i.id] })),
    sourceIds: [lead.id, ...follow.map((i) => i.id)],
  }
}

/**
 * Asks the model for a recap, checks it, and asks once more with the problems
 * if it fails. Returns the fallback when there's no client, nothing to write
 * from, or no draft passes.
 */
export async function writeBrief({
  client,
  period,
  sessionDate,
  items,
  ledger,
}: {
  client: Pick<OpenAI, "responses"> | null
  period: BriefPeriod
  sessionDate: string
  items: BriefItem[]
  /** Reserves each attempt's worst case before it's sent. Without one, attempts aren't metered (tests). */
  ledger?: SpendLedger
}): Promise<BriefResult> {
  const result = (brief: Brief, fallback: boolean, problems: string[], inputTokens = 0, outputTokens = 0): BriefResult => ({
    brief,
    fallback,
    problems,
    inputTokens,
    outputTokens,
    costUsd: costOf(inputTokens, outputTokens),
  })
  if (!client || items.length < 3) return result(fallbackBrief(items), true, [client ? "too few items" : "no AI client"])

  // Drop the oldest stories until the prompt, with room for retry feedback, is under the input limit.
  let kept = items
  let input = promptInput(period, sessionDate, kept)
  while (kept.length > 3 && inputTokenBound(input) + FEEDBACK_ROOM > MAX_INPUT_TOKENS) {
    kept = kept.slice(0, -1)
    input = promptInput(period, sessionDate, kept)
  }
  if (inputTokenBound(input) + FEEDBACK_ROOM > MAX_INPUT_TOKENS) return result(fallbackBrief(items), true, ["prompt over the input limit"])
  let inputTokens = 0
  let outputTokens = 0
  let feedback: string[] = []

  for (let attempt = 0; attempt < 2; attempt++) {
    const prompt = feedback.length ? `${input}${feedbackText(feedback)}` : input
    const reserved = worstCaseUsd(prompt)
    const reservation = ledger ? await ledger.reserve(reserved) : null
    if (ledger && !reservation) {
      feedback = ["the monthly AI budget can't cover another attempt"]
      break
    }
    let used = { inputTokens: 0, outputTokens: 0 }
    try {
      const response = await client.responses.create({
        model: NEWS_MODEL,
        instructions: SYSTEM,
        input: prompt,
        reasoning: { effort: "low" },
        max_output_tokens: MAX_OUTPUT_TOKENS,
        text: { format: { type: "json_schema", name: "market_recap", schema: BRIEF_SCHEMA as unknown as Record<string, unknown>, strict: true } },
      })
      used = { inputTokens: response.usage?.input_tokens ?? 0, outputTokens: response.usage?.output_tokens ?? 0 }
      inputTokens += used.inputTokens
      outputTokens += used.outputTokens
      if (reservation) await ledger!.settle(reservation, { ...used, costUsd: costOf(used.inputTokens, used.outputTokens) })
      const brief = JSON.parse(response.output_text) as Brief
      feedback = checkBrief(brief, kept, sessionDate)
      if (feedback.length === 0) return result(brief, false, [], inputTokens, outputTokens)
    } catch (error) {
      // A failed request may still have been billed, so its reservation stands as the cost.
      if (reservation && used.inputTokens === 0) await ledger!.settle(reservation, { inputTokens: 0, outputTokens: 0, costUsd: reserved })
      feedback = [error instanceof Error ? error.message : "request failed"]
    }
  }
  return result(fallbackBrief(items), true, feedback, inputTokens, outputTokens)
}

/** Whether `date` (YYYY-MM-DD) is the last trading session of its week, given a session lookup. */
export function isLastSessionOfWeek(date: string, isSession: (date: string) => boolean) {
  const d = new Date(`${date}T12:00:00Z`)
  for (let i = 1; i <= 6; i++) {
    const next = new Date(d.getTime() + i * 86_400_000)
    if (next.getUTCDay() === 6) return true // Saturday: the week is over
    if (isSession(next.toISOString().slice(0, 10))) return false
  }
  return true
}

/** Whether the market traded on a New York date (YYYY-MM-DD). */
export const isSessionDate = (date: string) => regularSession(new Date(`${date}T16:00:00Z`)) !== null

const previousDay = (date: string) => new Date(new Date(`${date}T12:00:00Z`).getTime() - 86_400_000).toISOString().slice(0, 10)

/** The UTC instant of the 4pm close on a New York date, daylight saving included. */
export function closeUtc(date: string): Date {
  const offset = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", timeZoneName: "shortOffset" })
    .formatToParts(new Date(`${date}T16:00:00Z`))
    .find((p) => p.type === "timeZoneName")?.value // "GMT-4" or "GMT-5"
  const hours = Number(offset?.replace("GMT", "")) || -5
  const [y, m, d] = date.split("-").map(Number)
  return new Date(Date.UTC(y!, m! - 1, d!, 16 - hours))
}

/**
 * The periods that should have a recap by `now`: the latest completed trading
 * day, and the latest completed trading week (which may be last week's, so a
 * missed Friday is written on Monday). Holidays are skipped.
 */
export function briefTargets(now: Date): { day: string | null; week: string | null } {
  let day = latestCompletedSession(now)
  for (let i = 0; i < 10 && !isSessionDate(day); i++) day = previousDay(day)
  if (!isSessionDate(day)) return { day: null, week: null }
  let week = day
  for (let i = 0; i < 10 && !(isSessionDate(week) && isLastSessionOfWeek(week, isSessionDate)); i++) week = previousDay(week)
  return { day, week: isSessionDate(week) && isLastSessionOfWeek(week, isSessionDate) ? week : null }
}

/** The stories a period's recap is written from: up to three hours after its close, looking back a day (and a bit) or a week. */
export function briefWindow(period: BriefPeriod, date: string, now: Date) {
  const to = new Date(Math.min(now.getTime(), closeUtc(date).getTime() + 3 * 3_600_000))
  const from = new Date(to.getTime() - (period === "day" ? 30 * 3_600_000 : 7 * 86_400_000))
  return { from, to }
}
