import type { XRay } from "./portfolio-xray.ts"
import { isVisual, withVisual, type Visual } from "./visuals.ts"
import { isWealthHref } from "../wealth/link.ts"
import { withoutFollowUps } from "./followups.ts"
import { cleanSources, mergeSources, type Source } from "./sources.ts"

/** The pure parts of the assistant's conversation state, kept apart from React so they can be tested. */

export type Msg = {
  id: string
  role: "user" | "assistant"
  text: string
  xray?: XRay
  /** Compact charts and lists from tools, drawn by the app. */
  visuals?: Visual[]
  /** Web addresses this answer may link to: tool results and search citations (cited ones also show as chips). */
  sources?: Source[]
  /** A same-origin button the assistant offers, e.g. "Open in Wealth Lab". */
  link?: { label: string; href: string }
  error?: string
  /** The person stopped this answer part-way. What was written stays; the window offers to regenerate it. */
  stopped?: boolean
}

export type ChatEvent =
  | { type: "status"; stage: "reading" | "analyzing" | "writing"; label?: string }
  | { type: "text"; delta: string }
  | { type: "xray"; data: XRay }
  | { type: "visual"; data: Visual }
  | { type: "link"; label: string; href: string }
  | { type: "sources"; items: Source[] }
  | { type: "error"; message: string }
  | { type: "done" }

/** Applies a streamed event to the assistant message being written. Events that don't touch the message leave it as is. */
export function applyEvent(m: Msg, event: ChatEvent): Msg {
  if (event.type === "text") return { ...m, text: m.text + event.delta }
  if (event.type === "xray") return { ...m, xray: event.data }
  if (event.type === "visual") return isVisual(event.data) ? { ...m, visuals: withVisual(m.visuals, event.data) } : m
  // Only same-origin Wealth Lab links are ever rendered, whatever the server sent.
  if (event.type === "link") return isWealthHref(event.href) && typeof event.label === "string" ? { ...m, link: { label: event.label.slice(0, 60), href: event.href } } : m
  if (event.type === "sources") return { ...m, sources: mergeSources(m.sources, cleanSources(event.items)) }
  if (event.type === "error") return { ...m, error: event.message }
  return m
}

/** Marks the answer being written as stopped by the person, unless it already failed. */
export function markStopped(m: Msg): Msg {
  return m.role === "assistant" && !m.error ? { ...m, stopped: true } : m
}

/** What goes to the server: the messages with text that didn't fail, as plain role/content pairs. */
export function requestMessages(history: Msg[]): { role: Msg["role"]; content: string }[] {
  return history.filter((m) => m.text && !m.error).map((m) => ({ role: m.role, content: m.role === "assistant" ? withoutFollowUps(m.text) : m.text }))
}

/** The conversation to continue from on a new question: failed turns are dropped. */
export function withoutErrors(messages: Msg[]): Msg[] {
  return messages.filter((m) => !m.error)
}

/** The conversation up to and including the last user message, for retrying. Null when there is none. */
export function historyForRetry(all: Msg[]): Msg[] | null {
  const lastUser = [...all].reverse().find((m) => m.role === "user")
  return lastUser ? all.slice(0, all.lastIndexOf(lastUser) + 1) : null
}

/** Replaces the last message with fn(last); an empty list stays empty. */
export function patchLastMessage(all: Msg[], fn: (m: Msg) => Msg): Msg[] {
  return all.length === 0 ? all : [...all.slice(0, -1), fn(all[all.length - 1]!)]
}
