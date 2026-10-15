import type { XRay } from "./portfolio-xray.ts"

/**
 * Saved conversations and reports. They live in this browser only (localStorage): nothing is sent to or stored
 * on the server, there is no database cost, and clearing site data removes them. This module is the pure part
 * (shapes, limits, pruning, validating what was read back); `saved-store.ts` does the storage.
 */

export const MAX_CONVERSATIONS = 30
export const MAX_REPORTS = 20
export const MAX_AGE_DAYS = 90
/** Text-only history: a conversation keeps at most this many messages, each trimmed. */
export const MAX_SAVED_MESSAGES = 40
export const MAX_SAVED_CHARS = 4000

export type SavedMessage = { role: "user" | "assistant"; text: string; link?: { label: string; href: string } }
export type SavedConversation = { id: string; title: string; updatedAt: number; messages: SavedMessage[] }
export type SavedReport = { id: string; savedAt: number; xray: XRay }

export type RecentItem = { kind: "chat" | "report"; id: string; label: string; at: number }

const DAY = 86_400_000
const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v)

/** The first thing the person asked, shortened: the label in the Recent list. */
export function titleFor(messages: { role: string; text: string }[]): string {
  const first = messages.find((m) => m.role === "user" && m.text.trim())
  const text = (first?.text ?? "Conversation").replace(/\s+/g, " ").trim()
  return text.length > 60 ? `${text.slice(0, 57)}…` : text
}

/** What is kept of a live conversation: text and links only (the X-Ray is recomputed, never stored), no failed turns. */
export function toSaved(messages: { role: "user" | "assistant"; text: string; link?: { label: string; href: string }; error?: string }[]): SavedMessage[] {
  return messages
    .filter((m) => m.text.trim() && !m.error)
    .slice(-MAX_SAVED_MESSAGES)
    .map((m) => ({ role: m.role, text: m.text.slice(0, MAX_SAVED_CHARS), ...(m.link ? { link: m.link } : {}) }))
}

/** Adds or updates a conversation, drops what's older than the retention window, newest first, capped. */
export function upsertConversation(list: SavedConversation[], next: SavedConversation, now: number): SavedConversation[] {
  const kept = list.filter((c) => c.id !== next.id && now - c.updatedAt <= MAX_AGE_DAYS * DAY)
  return [next, ...kept].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_CONVERSATIONS)
}

export function addReport(list: SavedReport[], next: SavedReport, now: number): SavedReport[] {
  const kept = list.filter((r) => r.id !== next.id && now - r.savedAt <= MAX_AGE_DAYS * DAY)
  return [next, ...kept].sort((a, b) => b.savedAt - a.savedAt).slice(0, MAX_REPORTS)
}

export const removeById = <T extends { id: string }>(list: T[], id: string): T[] => list.filter((x) => x.id !== id)

/** Chats and reports interleaved by time, for the one short "Recent" list. */
export function recentItems(chats: SavedConversation[], reports: SavedReport[], limit = 3): RecentItem[] {
  const items: RecentItem[] = [
    ...chats.map((c) => ({ kind: "chat" as const, id: c.id, label: c.title, at: c.updatedAt })),
    ...reports.map((r) => ({ kind: "report" as const, id: r.id, label: "Portfolio X-Ray", at: r.savedAt })),
  ]
  return items.sort((a, b) => b.at - a.at).slice(0, limit)
}

/** Reads back what localStorage holds without trusting it: anything malformed is dropped, not repaired. */
export function parseConversations(raw: unknown): SavedConversation[] {
  if (!Array.isArray(raw)) return []
  const out: SavedConversation[] = []
  for (const c of raw) {
    if (!isObject(c) || typeof c.id !== "string" || typeof c.title !== "string" || typeof c.updatedAt !== "number" || !Array.isArray(c.messages)) continue
    const messages: SavedMessage[] = []
    for (const m of c.messages) {
      if (!isObject(m) || (m.role !== "user" && m.role !== "assistant") || typeof m.text !== "string") continue
      const link = isObject(m.link) && typeof m.link.label === "string" && typeof m.link.href === "string" ? { label: m.link.label, href: m.link.href } : undefined
      messages.push({ role: m.role, text: m.text.slice(0, MAX_SAVED_CHARS), ...(link ? { link } : {}) })
    }
    if (messages.length > 0) out.push({ id: c.id, title: c.title.slice(0, 80), updatedAt: c.updatedAt, messages: messages.slice(-MAX_SAVED_MESSAGES) })
  }
  return out.slice(0, MAX_CONVERSATIONS)
}

export function parseReports(raw: unknown): SavedReport[] {
  if (!Array.isArray(raw)) return []
  const out: SavedReport[] = []
  for (const r of raw) {
    if (!isObject(r) || typeof r.id !== "string" || typeof r.savedAt !== "number" || !isObject(r.xray)) continue
    const x = r.xray
    // Enough of the shape to render safely; a stale or edited entry is dropped.
    if (!isObject(x.overview) || typeof x.overview.totalValue !== "number" || !Array.isArray(x.allocation) || !isObject(x.concentration) || !isObject(x.performance) || !Array.isArray(x.risks) || !Array.isArray(x.limitations)) continue
    out.push({ id: r.id, savedAt: r.savedAt, xray: x as unknown as XRay })
  }
  return out.slice(0, MAX_REPORTS)
}
