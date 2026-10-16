/**
 * What one assistant request may cost and carry, and the decision to allow it.
 * Pure, so the rules are testable without a database or a model.
 */

import { isRange, type Range } from "../ranges.ts"
import { isBenchmarkSymbol } from "../benchmarks.ts"

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
  monthlyUsd: Number(process.env.ASSISTANT_MONTHLY_BUDGET_USD) || 4,
  /** Messages of history sent with a request (the newest are kept). */
  maxMessages: 12,
  maxMessageChars: 2000,
  /** Model round-trips per request (each tool call needs another). */
  maxToolRounds: 4,
  maxOutputTokens: 2500,
  /** Input tokens one request may send, by the byte bound below. */
  maxInputTokens: 24_000,
} as const

/**
 * Whether the assistant should be offered at all. On by default; `ASSISTANT_ENABLED=0` is a runtime kill
 * switch (no redeploy), and without an API key or a positive monthly budget there is nothing to offer.
 */
export function assistantConfigured(env: Record<string, string | undefined>): boolean {
  if (env.ASSISTANT_ENABLED === "0") return false
  if (!env.OPENAI_API_KEY) return false
  const budget = env.ASSISTANT_MONTHLY_BUDGET_USD
  return budget === undefined || budget === "" || Number(budget) > 0
}

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

/**
 * Where the person is in the app and what is on screen, as the client reports it. Informational only: tools
 * re-check ownership, and nothing here is ever trusted as an identity or a figure.
 */
export type PageContext = {
  page: "portfolio" | "leagues" | "fantasy" | "news" | "board" | "wealth" | "other"
  /** The league (or fantasy league) open on the page. */
  entityId?: string
  /** The time range selected on the portfolio chart. */
  range?: Range
  /** The benchmark overlaid on the portfolio chart. */
  benchmark?: string
  /** The account card expanded on the portfolio page (its display name; only the signed-in user's own text). */
  account?: string
  /** A ticker the person is looking at on the portfolio page (typed into the holdings search). */
  holding?: string
}

const PAGES = new Set(["portfolio", "leagues", "fantasy", "news", "board", "wealth", "other"])

export function cleanContext(raw: unknown): PageContext {
  if (!raw || typeof raw !== "object") return { page: "other" }
  const { page, entityId, range, benchmark, account, holding } = raw as { page?: unknown; entityId?: unknown; range?: unknown; benchmark?: unknown; account?: unknown; holding?: unknown }
  const bench = typeof benchmark === "string" ? benchmark.toUpperCase() : ""
  // Free text from the browser is bounded and stripped of control characters; the prompt quotes it as data.
  const acct = typeof account === "string" ? account.replace(/[\u0000-\u001f\u007f<>`]/g, " ").replace(/\s+/g, " ").trim().slice(0, 40) : ""
  const ticker = typeof holding === "string" ? holding.trim().toUpperCase() : ""
  return {
    page: typeof page === "string" && PAGES.has(page) ? (page as PageContext["page"]) : "other",
    entityId: typeof entityId === "string" && /^[0-9a-f-]{8,40}$/i.test(entityId) ? entityId : undefined,
    // Only whitelisted values survive, so nothing free-form from the browser reaches the prompt.
    ...(typeof range === "string" && isRange(range) ? { range } : {}),
    ...(isBenchmarkSymbol(bench) ? { benchmark: bench } : {}),
    ...(acct ? { account: acct } : {}),
    ...(/^[A-Z][A-Z.\-]{0,9}$/.test(ticker) ? { holding: ticker } : {}),
  }
}

/** What one hosted web search costs, on top of the tokens it adds. A list price; the real bill is the cap's backstop. */
export const WEB_SEARCH_USD = Number(process.env.ASSISTANT_WEB_SEARCH_USD) || 0.012
/** Web searches one person may trigger per rolling day. */
export const WEB_SEARCHES_PER_DAY = Number(process.env.ASSISTANT_WEB_SEARCHES_PER_DAY) || 5

/** Hosted web search is on unless switched off with `ASSISTANT_WEB_SEARCH=0`. */
export const webSearchEnabled = (env: Record<string, string | undefined>) => env.ASSISTANT_WEB_SEARCH !== "0"

/**
 * Whether a question is the kind that needs the open web: news on a company, why something moved,
 * "latest", or an explicit ask to search. Everything else is answered from Peerfolio's own data, which is free.
 */
export function needsWeb(text: string): boolean {
  if (/\b(search|google|look (it )?up|latest|breaking|news (on|about|for)|what happened|any news|announce|rumou?r|analyst|guidance|upgrade|downgrade|lawsuit|recall|fda)\b/i.test(text)) return true
  // "Why is NVDA down": a ticker or company after "why", not "why is my tech weight high".
  return /\bwhy (is|are|did|was|were) (\$?[A-Z]{2,5}\b|[A-Z][a-z]+)/.test(text) && !/\bwhy (is|are|did|was|were) (my|the|our)\b/i.test(text)
}

/** Whether a question deserves reasoning effort: analysis, comparison, projections or long asks. Greetings and lookups don't. */
export function needsDepth(text: string): boolean {
  return text.length > 180 || /\b(analy[sz]e|compare|risk|strateg|rebalanc|diversif|project|scenario|what if|should i|explain|why|forecast|retire|tax)\b/i.test(text)
}

/** Greetings and thanks: the only turns cheap enough to answer with no reasoning at all. Everything else may involve numbers. */
export function isSmallTalk(text: string): boolean {
  return text.trim().length < 40 && /^(hi|hello|hey|thanks|thank you|thx|ok|okay|cool|great|nice|got it)\b[\s!.?]*$/i.test(text.trim())
}

/**
 * Older assistant replies are cut short before they are resent: the model needs the gist of what it said,
 * not every sentence, and each turn pays for the whole history again. The newest few stay whole.
 */
export function compactHistory(messages: ChatMessage[], keepWhole = 4, olderChars = 500): ChatMessage[] {
  return messages.map((m, i) => (m.role === "assistant" && i < messages.length - keepWhole && m.content.length > olderChars ? { ...m, content: `${m.content.slice(0, olderChars)}…` } : m))
}
