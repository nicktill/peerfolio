/**
 * What one assistant request may cost and carry, and the decision to allow it.
 * Pure, so the rules are testable without a database or a model.
 */

/** Dollars per million tokens. Defaults are GPT-5 mini's list prices, as in the news job. */
const INPUT_PER_M = Number(process.env.ASSISTANT_AI_INPUT_PER_M) || 0.25
const OUTPUT_PER_M = Number(process.env.ASSISTANT_AI_OUTPUT_PER_M) || 2

export const ASSISTANT_MODEL = process.env.ASSISTANT_AI_MODEL || "gpt-5-mini"

export const LIMITS = {
  /** Requests one person may start per rolling hour. */
  perHour: Number(process.env.ASSISTANT_PER_HOUR) || 40,
  /** Dollars one person may spend per rolling day. */
  perDayUsd: Number(process.env.ASSISTANT_PER_DAY_USD) || 0.25,
  /** Dollars everyone together may spend per calendar month (UTC). */
  monthlyUsd: Number(process.env.ASSISTANT_MONTHLY_BUDGET_USD) || 10,
  /** Messages of history sent with a request (the newest are kept). */
  maxMessages: 12,
  maxMessageChars: 2000,
  /** Model round-trips per request (each tool call needs another). */
  maxToolRounds: 4,
  maxOutputTokens: 2500,
  /** Input tokens one request may send, by the byte bound below. */
  maxInputTokens: 24_000,
} as const

export const costOf = (inputTokens: number, outputTokens: number) => (inputTokens * INPUT_PER_M + outputTokens * OUTPUT_PER_M) / 1_000_000

const utf8 = new TextEncoder()
/** UTF-8 bytes never undercount BPE tokens, so this is a hard upper bound with no tokenizer. */
export const tokenBound = (text: string) => utf8.encode(text).length

/**
 * The most one request can cost: every round may resend the full input and write
 * the full output cap. Deliberately pessimistic; the settled cost replaces it.
 */
export const worstCaseUsd = (inputBytes: number) =>
  costOf((inputBytes + 512) * LIMITS.maxToolRounds, LIMITS.maxOutputTokens * LIMITS.maxToolRounds)

export type Usage = {
  requestsLastHour: number
  userUsdLastDay: number
  monthUsd: number
}

export type Decision = { ok: true } | { ok: false; reason: "rate" | "daily" | "monthly"; message: string }

export function decide(usage: Usage, reserveUsd: number): Decision {
  if (usage.requestsLastHour >= LIMITS.perHour) {
    return { ok: false, reason: "rate", message: "You've asked a lot in the last hour. Try again in a little while." }
  }
  if (usage.userUsdLastDay + reserveUsd > LIMITS.perDayUsd) {
    return { ok: false, reason: "daily", message: "You've reached today's assistant limit. It resets within 24 hours." }
  }
  if (usage.monthUsd + reserveUsd > LIMITS.monthlyUsd) {
    return { ok: false, reason: "monthly", message: "The assistant is paused for the month. Everything else in Peerfolio still works." }
  }
  return { ok: true }
}

export type ChatMessage = { role: "user" | "assistant"; content: string }

/**
 * Keeps only well-formed user/assistant text, trims it, and keeps the newest
 * messages. The client sends its own history, so nothing here is trusted: roles
 * are whitelisted (no system or tool messages can be injected) and the last
 * message must come from the user.
 */
export function cleanHistory(raw: unknown): ChatMessage[] | null {
  if (!Array.isArray(raw)) return null
  const out: ChatMessage[] = []
  for (const m of raw) {
    if (!m || typeof m !== "object") return null
    const { role, content } = m as { role?: unknown; content?: unknown }
    if ((role !== "user" && role !== "assistant") || typeof content !== "string") return null
    const text = content.trim().slice(0, LIMITS.maxMessageChars)
    if (text) out.push({ role, content: text })
  }
  const recent = out.slice(-LIMITS.maxMessages)
  while (recent.length > 0 && recent[0]!.role !== "user") recent.shift()
  if (recent.length === 0 || recent.at(-1)!.role !== "user") return null
  return recent
}

/** Where the person is in the app, as the client reports it. Informational only: tools re-check ownership. */
export type PageContext = { page: "portfolio" | "leagues" | "fantasy" | "news" | "board" | "other"; entityId?: string }

const PAGES = new Set(["portfolio", "leagues", "fantasy", "news", "board", "other"])

export function cleanContext(raw: unknown): PageContext {
  if (!raw || typeof raw !== "object") return { page: "other" }
  const { page, entityId } = raw as { page?: unknown; entityId?: unknown }
  return {
    page: typeof page === "string" && PAGES.has(page) ? (page as PageContext["page"]) : "other",
    entityId: typeof entityId === "string" && /^[0-9a-f-]{8,40}$/i.test(entityId) ? entityId : undefined,
  }
}
