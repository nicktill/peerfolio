import type { XRay } from "./portfolio-xray.ts"

/** The pure parts of the assistant's conversation state, kept apart from React so they can be tested. */

export type Msg = {
  id: string
  role: "user" | "assistant"
  text: string
  xray?: XRay
  error?: string
}

export type ChatEvent =
  | { type: "status"; stage: "reading" | "analyzing" | "writing" }
  | { type: "text"; delta: string }
  | { type: "xray"; data: XRay }
  | { type: "error"; message: string }
  | { type: "done" }

/** Applies a streamed event to the assistant message being written. Events that don't touch the message leave it as is. */
export function applyEvent(m: Msg, event: ChatEvent): Msg {
  if (event.type === "text") return { ...m, text: m.text + event.delta }
  if (event.type === "xray") return { ...m, xray: event.data }
  if (event.type === "error") return { ...m, error: event.message }
  return m
}

/** What goes to the server: the messages with text that didn't fail, as plain role/content pairs. */
export function requestMessages(history: Msg[]): { role: Msg["role"]; content: string }[] {
  return history.filter((m) => m.text && !m.error).map((m) => ({ role: m.role, content: m.text }))
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
