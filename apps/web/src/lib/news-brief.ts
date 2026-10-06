import type OpenAI from "openai"

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
  const lines = items.map((i) => `[${i.id}] ${i.source} · ${timeEt.format(i.publishedAt)} ET — ${i.title}${i.summary ? `. ${i.summary}` : ""}`)
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

/**
 * Every figure in a text, compared by value so "1,250" matches "1250" and "0.40" matches "0.4".
 * Single digits are left alone ("3 takeaways", "Q3").
 */
export function figures(text: string) {
  return (text.match(/\d[\d,]*(?:\.\d+)?/g) ?? [])
    .filter((n) => n.replace(/[,.]/g, "").length > 1)
    .map((n) => String(Number(n.replace(/,/g, ""))))
}

/** What's wrong with a draft, or nothing. */
export function checkBrief(brief: Brief, items: BriefItem[], sessionDate: string): string[] {
  const problems: string[] = []
  const ids = new Set(items.map((i) => i.id))
  const allowed = new Set([...items.flatMap((i) => figures(`${i.title} ${i.summary ?? ""}`)), ...figures(sessionDate.replace(/-/g, " "))])

  if (!brief.headline.trim() || brief.headline.length > 110) problems.push("The headline must be present and at most 90 characters.")
  if (!brief.body.trim() || brief.body.length > 700) problems.push("The body must be present and at most 600 characters.")
  if (brief.takeaways.length !== 3) problems.push("Write exactly 3 takeaways.")
  for (const t of brief.takeaways) {
    if (!t.title.trim() || !t.body.trim() || t.body.length > 220) problems.push(`Takeaway "${t.title}" needs a short title and one sentence of at most 180 characters.`)
    if (t.sourceIds.length === 0) problems.push(`Takeaway "${t.title}" must cite the items it relies on.`)
  }
  const cited = [...brief.sourceIds, ...brief.takeaways.flatMap((t) => t.sourceIds)]
  const unknown = cited.filter((id) => !ids.has(id))
  if (unknown.length) problems.push(`These ids are not in the items: ${[...new Set(unknown)].join(", ")}.`)
  if (brief.sourceIds.length === 0) problems.push("List the ids the headline and body rely on in sourceIds.")

  const text = [brief.headline, brief.body, ...brief.takeaways.flatMap((t) => [t.title, t.body])].join(" ")
  const invented = [...new Set(figures(text).filter((n) => !allowed.has(n)))]
  if (invented.length) problems.push(`These numbers do not appear in the items, so they cannot be used: ${invented.join(", ")}.`)
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
}: {
  client: Pick<OpenAI, "responses"> | null
  period: BriefPeriod
  sessionDate: string
  items: BriefItem[]
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

  const input = promptInput(period, sessionDate, items)
  let inputTokens = 0
  let outputTokens = 0
  let feedback: string[] = []

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await client.responses.create({
        model: NEWS_MODEL,
        instructions: SYSTEM,
        input: feedback.length ? `${input}\n\nYour previous draft had these problems. Fix all of them:\n- ${feedback.join("\n- ")}` : input,
        reasoning: { effort: "low" },
        max_output_tokens: 6000,
        text: { format: { type: "json_schema", name: "market_recap", schema: BRIEF_SCHEMA as unknown as Record<string, unknown>, strict: true } },
      })
      inputTokens += response.usage?.input_tokens ?? 0
      outputTokens += response.usage?.output_tokens ?? 0
      const brief = JSON.parse(response.output_text) as Brief
      feedback = checkBrief(brief, items, sessionDate)
      if (feedback.length === 0) return result(brief, false, [], inputTokens, outputTokens)
    } catch (error) {
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
