/**
 * The last conversation, kept per person in this browser so they can come back to it. Additive and local only:
 * nothing is written to the server, and an old format or a different account's thread is simply not read.
 * Pure (storage is passed in by the caller), so it can be tested.
 */

import type { Msg } from "./chat-state.ts"
import { cleanSources } from "./sources.ts"

export const THREAD_KEY = "pf-assistant-thread-v2"
const KEEP = 20
const MAX_AGE_MS = 7 * 86_400_000

type Stored = { at: number; messages: Msg[] }

/** A short stable key for a person, so threads from different accounts on one browser never mix. */
export const threadKey = (userId: string) => `${THREAD_KEY}:${userId.slice(0, 64)}`

/** What is stored: the newest messages, text and the few small things worth keeping, never reports or errors. */
export function packThread(messages: Msg[], now: number): string {
  const kept = messages
    .filter((m) => m.text && !m.error)
    .slice(-KEEP)
    .map((m): Msg => ({ id: m.id, role: m.role, text: m.text, ...(m.sources?.length ? { sources: m.sources } : {}), ...(m.link ? { link: m.link } : {}) }))
  return JSON.stringify({ at: now, messages: kept } satisfies Stored)
}

/** The stored thread, or an empty one when it is missing, malformed, from another format or older than a week. */
export function unpackThread(raw: string | null, now: number): Msg[] {
  if (!raw) return []
  try {
    const data = JSON.parse(raw) as Partial<Stored> | null
    if (!data || typeof data.at !== "number" || now - data.at > MAX_AGE_MS || !Array.isArray(data.messages)) return []
    const out: Msg[] = []
    for (const m of data.messages) {
      if (!m || typeof m !== "object") continue
      const { id, role, text, sources, link } = m as Partial<Msg>
      if (typeof id !== "string" || (role !== "user" && role !== "assistant") || typeof text !== "string" || !text) continue
      out.push({ id, role, text: text.slice(0, 8000), ...(sources ? { sources: cleanSources(sources) } : {}), ...(link && typeof link.href === "string" && typeof link.label === "string" ? { link } : {}) })
    }
    // A thread that ends on a question the model never answered would resend itself; drop the dangling user turn.
    while (out.length > 0 && out[out.length - 1]!.role === "user") out.pop()
    return out
  } catch {
    return []
  }
}
