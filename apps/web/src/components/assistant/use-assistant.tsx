"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import { usePathname } from "next/navigation"
import { parseStreamChunk } from "@web/lib/ai/stream-parse"
import { applyEvent, historyForRetry, patchLastMessage, requestMessages, withoutErrors, type ChatEvent as Event, type Msg } from "@web/lib/ai/chat-state"
import type { XRay } from "@web/lib/ai/portfolio-xray"
import { addReport, parseConversations, parseReports, recentItems, removeById, titleFor, toSaved, upsertConversation, type RecentItem, type SavedConversation, type SavedReport } from "@web/lib/ai/saved"

/**
 * The assistant's conversation, kept above the pages so it survives navigation.
 * The live conversation is in memory and this tab's sessionStorage. Saved conversations (text only) and saved
 * reports are kept in this browser's localStorage: nothing is written to the server, and clearing site data
 * removes them. See lib/ai/saved.ts for the limits.
 */

export type Page = "portfolio" | "leagues" | "fantasy" | "news" | "board" | "wealth" | "other"
export type Phase = "idle" | "reading" | "analyzing" | "writing"

export type { Msg }

type Assistant = {
  messages: Msg[]
  phase: Phase
  busy: boolean
  page: Page
  /** A specific league (or similar) is open, rather than the section's list page. */
  detail: boolean
  send: (text: string) => void
  cancel: () => void
  retry: () => void
  reset: () => void
  /** The newest few saved conversations and reports, for the launch card. */
  recent: RecentItem[]
  saveReport: (xray: XRay) => void
  openRecent: (kind: RecentItem["kind"], id: string) => void
  removeRecent: (kind: RecentItem["kind"], id: string) => void
  /** Bumped whenever a report arrives, so the window can open its workspace. */
  reportSeq: number
}

const Ctx = createContext<Assistant | null>(null)

const STORE = "pf-assistant-chat-v1"
const CHATS = "pf-assistant-saved-chats-v1"
const REPORTS = "pf-assistant-saved-reports-v1"

function readJson(key: string): unknown {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null")
  } catch {
    return null
  }
}
function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage full or blocked: saving is a convenience, so the live conversation carries on.
  }
}
const uid = () => Math.random().toString(36).slice(2, 10)

export function pageOf(pathname: string): Page {
  if (pathname.startsWith("/dashboard")) return "portfolio"
  if (pathname.startsWith("/leagues")) return "leagues"
  if (pathname.startsWith("/fantasy")) return "fantasy"
  if (pathname.startsWith("/news")) return "news"
  if (pathname.startsWith("/board")) return "board"
  if (pathname.startsWith("/wealth")) return "wealth"
  return "other"
}

export function AssistantProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const page = pageOf(pathname)
  const entityId = pathname.split("/")[2]
  // /leagues/<id> and /fantasy/<id> are a specific league; /fantasy/join/<code> and the section roots are not.
  const detail = !!entityId && entityId !== "join" && (page === "leagues" || page === "fantasy")

  const [messages, setMessages] = useState<Msg[]>([])
  const [phase, setPhase] = useState<Phase>("idle")
  const [reportSeq, setReportSeq] = useState(0)
  const abort = useRef<AbortController | null>(null)
  const hydrated = useRef(false)
  const [chats, setChats] = useState<SavedConversation[]>([])
  const [reports, setReports] = useState<SavedReport[]>([])
  const convoId = useRef<string | null>(null)
  /** Viewing a saved report is not a conversation: it isn't saved again as one until the person says something. */
  const viewingReport = useRef(false)
  const live = useRef({ messages, page, entityId })
  live.current = { messages, page, entityId }

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(STORE)
      if (saved) setMessages((JSON.parse(saved) as Msg[]).filter((m) => m && typeof m.text === "string"))
    } catch {
      // Storage can be blocked; the conversation just won't survive a reload.
    }
    setChats(parseConversations(readJson(CHATS)))
    setReports(parseReports(readJson(REPORTS)))
    hydrated.current = true
  }, [])

  // Keep the saved copy of the current conversation up to date once an answer has settled.
  useEffect(() => {
    if (!hydrated.current || phase !== "idle" || viewingReport.current) return
    const saved = toSaved(messages)
    if (saved.length === 0) return
    if (!convoId.current) convoId.current = uid()
    const entry: SavedConversation = { id: convoId.current, title: titleFor(saved), updatedAt: Date.now(), messages: saved }
    setChats((all) => {
      const next = upsertConversation(all, entry, Date.now())
      writeJson(CHATS, next)
      return next
    })
  }, [messages, phase])

  useEffect(() => {
    if (!hydrated.current || phase !== "idle") return
    try {
      sessionStorage.setItem(STORE, JSON.stringify(messages.slice(-20)))
    } catch {
      // See above.
    }
  }, [messages, phase])

  const patchLast = useCallback((fn: (m: Msg) => Msg) => {
    setMessages((all) => patchLastMessage(all, fn))
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
            messages: requestMessages(history),
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
          const parsed = parseStreamChunk<Event>(buffer, decoder.decode(value, { stream: true }))
          buffer = parsed.rest
          for (const event of parsed.events) {
            if (event.type === "status") setPhase(event.stage)
            else patchLast((m) => applyEvent(m, event))
            if (event.type === "xray") setReportSeq((n) => n + 1)
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
      viewingReport.current = false
      const history = [...withoutErrors(live.current.messages), { id: uid(), role: "user" as const, text }]
      setMessages([...history, { id: uid(), role: "assistant", text: "" }])
      void run(history)
    },
    [run],
  )

  const cancel = useCallback(() => abort.current?.abort(), [])

  const retry = useCallback(() => {
    if (abort.current) return
    const all = live.current.messages
    const history = historyForRetry(all)
    if (!history) return
    setMessages([...history, { id: uid(), role: "assistant", text: "" }])
    void run(history)
  }, [run])

  const reset = useCallback(() => {
    abort.current?.abort()
    // The finished conversation stays in the saved list; the next one starts fresh.
    convoId.current = null
    viewingReport.current = false
    setMessages([])
    try {
      sessionStorage.removeItem(STORE)
    } catch {
      // See above.
    }
  }, [])

  const saveReport = useCallback((xray: XRay) => {
    const now = Date.now()
    setReports((all) => {
      const next = addReport(all, { id: uid(), savedAt: now, xray }, now)
      writeJson(REPORTS, next)
      return next
    })
  }, [])

  const openRecent = useCallback(
    (kind: RecentItem["kind"], id: string) => {
      if (abort.current) return
      if (kind === "chat") {
        const chat = chats.find((c) => c.id === id)
        if (!chat) return
        viewingReport.current = false
        convoId.current = chat.id
        setMessages(chat.messages.map((m) => ({ id: uid(), role: m.role, text: m.text, ...(m.link ? { link: m.link } : {}) })))
      } else {
        const report = reports.find((r) => r.id === id)
        if (!report) return
        viewingReport.current = true
        convoId.current = null
        const when = new Date(report.savedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
        setMessages([{ id: uid(), role: "assistant", text: `Saved report from ${when}. Figures are as of then; ask me to run it again for today.`, xray: report.xray }])
      }
    },
    [chats, reports],
  )

  const removeRecent = useCallback((kind: RecentItem["kind"], id: string) => {
    if (kind === "chat") {
      setChats((all) => {
        const next = removeById(all, id)
        writeJson(CHATS, next)
        return next
      })
    } else {
      setReports((all) => {
        const next = removeById(all, id)
        writeJson(REPORTS, next)
        return next
      })
    }
  }, [])

  const recent = useMemo(() => recentItems(chats, reports, 3), [chats, reports])

  const value = useMemo<Assistant>(
    () => ({ messages, phase, busy: phase !== "idle", page, detail, send, cancel, retry, reset, recent, saveReport, openRecent, removeRecent, reportSeq }),
    [messages, phase, page, detail, send, cancel, retry, reset, recent, saveReport, openRecent, removeRecent, reportSeq],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAssistant() {
  const value = useContext(Ctx)
  if (!value) throw new Error("useAssistant must be used inside AssistantProvider")
  return value
}

export type PageCopy = {
  title: string
  subtitle: string
  suggestions: { label: string; featured?: boolean }[]
  /** Shown when the page's own data isn't something the assistant can read yet. */
  note?: string
}

const PORTFOLIO_PROMPTS = [
  { label: "Analyze my portfolio", featured: true },
  { label: "Am I overly concentrated?" },
  { label: "What are my biggest risks?" },
  { label: "What are my largest holdings?" },
]

/**
 * What the empty state says on each page. Only prompts the assistant can answer today
 * appear: the portfolio and news have tools behind them, the social pages don't yet.
 */
export const PAGE_COPY: Record<Page, PageCopy> = {
  portfolio: {
    title: "What would you like to understand?",
    subtitle: "I can read your holdings and explain what they show.",
    suggestions: PORTFOLIO_PROMPTS,
  },
  news: {
    title: "What's moving the market?",
    subtitle: "I can read today's recap and headlines and tie them to what you own.",
    suggestions: [
      { label: "Summarize today's market", featured: true },
      { label: "Which news matters to my holdings?" },
      { label: "What might today's moves mean for my portfolio?" },
      { label: "Analyze my portfolio" },
    ],
  },
  leagues: {
    title: "Make sense of your league",
    subtitle: "I can read the standings you can see and explain where you stand.",
    suggestions: [
      { label: "Why am I ranked here?", featured: true },
      { label: "How far am I from the leader?" },
      { label: "Who's ahead of me, and by how much?" },
      { label: "Analyze my portfolio" },
    ],
  },
  fantasy: {
    title: "Sharpen your fantasy strategy",
    subtitle: "I can read your league's standings, picks and trades.",
    suggestions: [
      { label: "Analyze my fantasy portfolio", featured: true },
      { label: "What drove my fantasy returns?" },
      { label: "How does my strategy compare with the leader?" },
      { label: "What changed in the standings?" },
    ],
  },
  board: {
    title: "Understand the board",
    subtitle: "Board rankings aren't readable yet. For now I can analyze your own portfolio.",
    suggestions: [
      { label: "Analyze my portfolio", featured: true },
      { label: "What are my biggest risks?" },
      { label: "What are my largest holdings?" },
    ],
    note: "Board data is coming soon.",
  },
  wealth: {
    title: "Plan your wealth",
    subtitle: "I can run your what-ifs through Wealth Lab's engine, so the numbers are computed, not guessed.",
    suggestions: [
      { label: "What if I invest $500 more a month?", featured: true },
      { label: "How much do I need to save to reach $1M?" },
      { label: "Make a more conservative scenario" },
    ],
  },
  other: {
    title: "What would you like to understand?",
    subtitle: "I can read your holdings and explain what they show.",
    suggestions: PORTFOLIO_PROMPTS,
  },
}

/** The section's list page, where no single league is open: questions here span all of the person's leagues. */
const LIST_COPY: Partial<Record<Page, PageCopy>> = {
  leagues: {
    title: "How are your leagues going?",
    subtitle: "I can read the standings of every league you're in.",
    suggestions: [
      { label: "Which of my leagues am I leading?", featured: true },
      { label: "Where am I furthest behind?" },
      { label: "Summarize my standing in each league" },
      { label: "Analyze my portfolio" },
    ],
  },
  fantasy: {
    title: "How are your fantasy leagues going?",
    subtitle: "I can read your fantasy leagues, picks and standings.",
    suggestions: [
      { label: "Which fantasy league am I winning?", featured: true },
      { label: "Summarize my fantasy leagues" },
      { label: "Where could I improve?" },
      { label: "Analyze my portfolio" },
    ],
  },
}

/** What the empty state says for this page, including whether a specific league is open. */
export function copyFor(page: Page, detail: boolean): PageCopy {
  return (!detail && LIST_COPY[page]) || PAGE_COPY[page]
}

export const PAGE_LABEL: Record<Page, string> = {
  portfolio: "Portfolio",
  leagues: "Leagues",
  fantasy: "Fantasy",
  news: "News",
  board: "Board",
  wealth: "Wealth Lab",
  other: "Peerfolio",
}
