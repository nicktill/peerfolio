"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import { usePathname } from "next/navigation"
import type { XRay } from "@web/lib/ai/portfolio-xray"

/**
 * The assistant's conversation, kept above the pages so it survives navigation.
 * It lives in memory and in this tab's sessionStorage only: financial answers
 * aren't written to the server, and they're gone when the tab closes.
 */

export type Page = "portfolio" | "leagues" | "fantasy" | "news" | "board" | "other"
export type Phase = "idle" | "reading" | "analyzing" | "writing"

export type Msg = {
  id: string
  role: "user" | "assistant"
  text: string
  xray?: XRay
  error?: string
}

type Event =
  | { type: "status"; stage: "reading" | "analyzing" | "writing" }
  | { type: "text"; delta: string }
  | { type: "xray"; data: XRay }
  | { type: "error"; message: string }
  | { type: "done" }

type Assistant = {
  messages: Msg[]
  phase: Phase
  busy: boolean
  page: Page
  send: (text: string) => void
  cancel: () => void
  retry: () => void
  reset: () => void
  /** Bumped whenever a report arrives, so the window can open its workspace. */
  reportSeq: number
}

const Ctx = createContext<Assistant | null>(null)

const STORE = "pf-assistant-chat-v1"
const uid = () => Math.random().toString(36).slice(2, 10)

export function pageOf(pathname: string): Page {
  if (pathname.startsWith("/dashboard")) return "portfolio"
  if (pathname.startsWith("/leagues")) return "leagues"
  if (pathname.startsWith("/fantasy")) return "fantasy"
  if (pathname.startsWith("/news")) return "news"
  if (pathname.startsWith("/board")) return "board"
  return "other"
}

export function AssistantProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const page = pageOf(pathname)
  const entityId = pathname.split("/")[2]

  const [messages, setMessages] = useState<Msg[]>([])
  const [phase, setPhase] = useState<Phase>("idle")
  const [reportSeq, setReportSeq] = useState(0)
  const abort = useRef<AbortController | null>(null)
  const hydrated = useRef(false)
  const live = useRef({ messages, page, entityId })
  live.current = { messages, page, entityId }

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(STORE)
      if (saved) setMessages((JSON.parse(saved) as Msg[]).filter((m) => m && typeof m.text === "string"))
    } catch {
      // Storage can be blocked; the conversation just won't survive a reload.
    }
    hydrated.current = true
  }, [])

  useEffect(() => {
    if (!hydrated.current || phase !== "idle") return
    try {
      sessionStorage.setItem(STORE, JSON.stringify(messages.slice(-20)))
    } catch {
      // See above.
    }
  }, [messages, phase])

  const patchLast = useCallback((fn: (m: Msg) => Msg) => {
    setMessages((all) => (all.length === 0 ? all : [...all.slice(0, -1), fn(all[all.length - 1]!)]))
  }, [])

  const run = useCallback(
    async (history: Msg[]) => {
      const controller = new AbortController()
      abort.current = controller
      setPhase("reading")
      const finish = () => {
        if (abort.current === controller) abort.current = null
        setPhase("idle")
      }

      try {
        const res = await fetch("/api/assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            messages: history.filter((m) => m.text && !m.error).map((m) => ({ role: m.role, content: m.text })),
            context: { page: live.current.page, entityId: live.current.entityId },
          }),
        })
        if (!res.ok || !res.body) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null
          patchLast((m) => ({ ...m, error: body?.error ?? "The assistant isn't available right now." }))
          return finish()
        }

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ""
        for (;;) {
          const { value, done } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split("\n")
          buffer = lines.pop() ?? ""
          for (const line of lines) {
            if (!line.trim()) continue
            let event: Event
            try {
              event = JSON.parse(line) as Event
            } catch {
              continue
            }
            if (event.type === "status") setPhase(event.stage)
            else if (event.type === "text") patchLast((m) => ({ ...m, text: m.text + event.delta }))
            else if (event.type === "xray") {
              patchLast((m) => ({ ...m, xray: event.data }))
              setReportSeq((n) => n + 1)
            } else if (event.type === "error") patchLast((m) => ({ ...m, error: event.message }))
          }
        }
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          patchLast((m) => ({ ...m, error: "The connection dropped. Try again." }))
        }
      }
      finish()
    },
    [patchLast],
  )

  const send = useCallback(
    (raw: string) => {
      const text = raw.trim()
      if (!text || abort.current) return
      const history = [...live.current.messages.filter((m) => !m.error), { id: uid(), role: "user" as const, text }]
      setMessages([...history, { id: uid(), role: "assistant", text: "" }])
      void run(history)
    },
    [run],
  )

  const cancel = useCallback(() => abort.current?.abort(), [])

  const retry = useCallback(() => {
    if (abort.current) return
    const all = live.current.messages
    const lastUser = [...all].reverse().find((m) => m.role === "user")
    if (!lastUser) return
    const history = all.slice(0, all.lastIndexOf(lastUser) + 1)
    setMessages([...history, { id: uid(), role: "assistant", text: "" }])
    void run(history)
  }, [run])

  const reset = useCallback(() => {
    abort.current?.abort()
    setMessages([])
    try {
      sessionStorage.removeItem(STORE)
    } catch {
      // See above.
    }
  }, [])

  const value = useMemo<Assistant>(
    () => ({ messages, phase, busy: phase !== "idle", page, send, cancel, retry, reset, reportSeq }),
    [messages, phase, page, send, cancel, retry, reset, reportSeq],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAssistant() {
  const value = useContext(Ctx)
  if (!value) throw new Error("useAssistant must be used inside AssistantProvider")
  return value
}

/** Prompts the assistant can answer today, by page. Page-specific sets arrive with the tools that back them. */
export function suggestionsFor(page: Page): { label: string; featured?: boolean }[] {
  const base = [
    { label: "Analyze my portfolio", featured: true },
    { label: "Am I overly concentrated?" },
    { label: "What are my biggest risks?" },
    { label: "What are my largest holdings?" },
  ]
  return page === "portfolio" || page === "other" ? base : base.slice(0, 3)
}

export const PAGE_LABEL: Record<Page, string> = {
  portfolio: "Portfolio",
  leagues: "Leagues",
  fantasy: "Fantasy",
  news: "News",
  board: "Board",
  other: "Peerfolio",
}
