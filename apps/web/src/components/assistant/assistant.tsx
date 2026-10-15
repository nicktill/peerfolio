"use client"

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react"
import { AnimatePresence, MotionConfig, motion } from "motion/react"
import { ArrowUp, Check, Maximize2, Minimize2, Minus, RotateCcw, Square, SquarePen } from "lucide-react"
import { Orb } from "@web/components/assistant/orb"
import { PAGE_LABEL, suggestionsFor, useAssistant, type Msg, type Phase } from "@web/components/assistant/use-assistant"
import { XRayReport } from "@web/components/assistant/xray-report"
import "@web/components/assistant/assistant.css"

const GEO_KEY = "pf-assistant-geo-v1"
const MIN = { w: 340, h: 400 }
const COMPACT = { w: 400, h: 600 }
const EDGE = 12

type Geo = { w: number; h: number; right: number; bottom: number; expanded: boolean }

const viewport = () => ({ vw: window.innerWidth, vh: window.innerHeight })

function expandedSize() {
  const { vw, vh } = viewport()
  return { w: Math.min(860, vw - EDGE * 4), h: Math.min(820, vh - EDGE * 4) }
}

/** Keeps the whole window on screen whatever the saved size, position or viewport. */
function fit(g: Geo): Geo {
  const { vw, vh } = viewport()
  const size = g.expanded ? expandedSize() : { w: Math.min(Math.max(g.w, MIN.w), vw - EDGE * 2), h: Math.min(Math.max(g.h, MIN.h), vh - EDGE * 2) }
  return {
    ...g,
    w: g.expanded ? g.w : size.w,
    h: g.expanded ? g.h : size.h,
    right: Math.min(Math.max(g.right, EDGE), Math.max(EDGE, vw - size.w - EDGE)),
    bottom: Math.min(Math.max(g.bottom, EDGE), Math.max(EDGE, vh - size.h - EDGE)),
  }
}

function loadGeo(): Geo {
  const fallback: Geo = { ...COMPACT, right: 24, bottom: 24, expanded: false }
  try {
    const saved = JSON.parse(localStorage.getItem(GEO_KEY) ?? "null") as Partial<Geo> | null
    if (saved && [saved.w, saved.h, saved.right, saved.bottom].every((n) => typeof n === "number" && Number.isFinite(n))) {
      return fit({ ...fallback, ...saved, expanded: !!saved.expanded })
    }
  } catch {
    // Unreadable storage: use the default placement.
  }
  return fit(fallback)
}

const subscribeNarrow = (cb: () => void) => {
  const mq = window.matchMedia("(max-width: 720px)")
  mq.addEventListener("change", cb)
  return () => mq.removeEventListener("change", cb)
}
const useNarrow = () => useSyncExternalStore(subscribeNarrow, () => window.matchMedia("(max-width: 720px)").matches, () => false)

const isMac = () => typeof navigator !== "undefined" && /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent)

export function AssistantRoot() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key === "/") {
        e.preventDefault()
        setOpen((v) => !v)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  return (
    <MotionConfig reducedMotion="user">
      <AnimatePresence>{!open ? <Launcher key="launcher" onOpen={() => setOpen(true)} /> : null}</AnimatePresence>
      <AnimatePresence>{open ? <Panel key="panel" onClose={() => setOpen(false)} /> : null}</AnimatePresence>
    </MotionConfig>
  )
}

function Launcher({ onOpen }: { onOpen: () => void }) {
  const { busy, phase } = useAssistant()
  const [hint, setHint] = useState("")
  useEffect(() => setHint(isMac() ? "⌘/" : "Ctrl /"), [])
  return (
    <motion.button
      type="button"
      className="pf-ai-launch"
      onClick={onOpen}
      initial={{ opacity: 0, y: 12, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.96 }}
      transition={{ type: "spring", stiffness: 420, damping: 34 }}
      whileTap={{ scale: 0.97 }}
      aria-label="Open Peerfolio Intelligence"
      aria-keyshortcuts="Control+Slash Meta+Slash"
    >
      <Orb size={20} phase={phase} />
      <span className="pf-ai-launch-t">{busy ? "Working…" : "Ask Peerfolio"}</span>
      {hint ? <kbd className="pf-ai-kbd">{hint}</kbd> : null}
    </motion.button>
  )
}

function Panel({ onClose }: { onClose: () => void }) {
  const narrow = useNarrow()
  const { messages, phase, busy, page, send, cancel, retry, reset, reportSeq } = useAssistant()
  const [geo, setGeo] = useState<Geo>(() => loadGeo())
  const [morph, setMorph] = useState(false)
  const [interacting, setInteracting] = useState(false)
  const scroller = useRef<HTMLDivElement>(null)
  const stick = useRef(true)
  const panelRef = useRef<HTMLElement>(null)
  const gesture = useRef<{ kind: "move" | "size"; x: number; y: number; g: Geo } | null>(null)
  const seenReport = useRef(reportSeq)

  // The phone sheet has its own state: a saved desktop "expanded" must not make it open full screen.
  const [sheetUp, setSheetUp] = useState(false)
  const expanded = narrow ? sheetUp : geo.expanded

  const setExpanded = useCallback(
    (next: boolean) => {
      if (narrow) return setSheetUp(next)
      setMorph(true)
      setGeo((g) => fit({ ...g, expanded: next }))
      window.setTimeout(() => setMorph(false), 420)
    },
    [narrow],
  )

  // A report is a workspace, not a chat bubble: open it wide when one arrives.
  useEffect(() => {
    if (reportSeq !== seenReport.current) {
      seenReport.current = reportSeq
      if (!expanded) setExpanded(true)
    }
  }, [reportSeq, expanded, setExpanded])

  useEffect(() => {
    const onResize = () => setGeo((g) => fit(g))
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])

  useEffect(() => {
    if (interacting) return
    try {
      localStorage.setItem(GEO_KEY, JSON.stringify(geo))
    } catch {
      // Not persisted; the window still works.
    }
  }, [geo, interacting])

  useLayoutEffect(() => {
    const el = scroller.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
  }, [messages, phase])

  const begin = (kind: "move" | "size") => (e: React.PointerEvent<HTMLElement>) => {
    if (narrow || expanded || e.button !== 0 || (e.target as HTMLElement).closest("button")) return
    e.currentTarget.setPointerCapture(e.pointerId)
    gesture.current = { kind, x: e.clientX, y: e.clientY, g: geo }
    setInteracting(true)
  }
  const track = (e: React.PointerEvent<HTMLElement>) => {
    const s = gesture.current
    if (!s) return
    const dx = e.clientX - s.x
    const dy = e.clientY - s.y
    if (s.kind === "move") setGeo(fit({ ...s.g, right: s.g.right - dx, bottom: s.g.bottom - dy }))
    else setGeo(fit({ ...s.g, w: s.g.w - dx, h: s.g.h - dy }))
  }
  const end = (e: React.PointerEvent<HTMLElement>) => {
    if (!gesture.current) return
    gesture.current = null
    e.currentTarget.releasePointerCapture(e.pointerId)
    setInteracting(false)
  }

  // Keyboard equivalent of dragging: Alt+arrows move the window, Alt+Shift+arrows resize it.
  const nudge = (e: React.KeyboardEvent<HTMLElement>) => {
    if (narrow || expanded || !e.altKey || !e.key.startsWith("Arrow")) return
    e.preventDefault()
    const step = 24
    const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0
    const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0
    // Right/bottom anchor the window, so moving right *decreases* `right`; growing up/left grows w/h.
    setGeo((g) => (e.shiftKey ? fit({ ...g, w: g.w - dx, h: g.h - dy }) : fit({ ...g, right: g.right - dx, bottom: g.bottom - dy })))
  }

  const announce = !busy ? (messages.at(-1)?.error ? "The assistant hit an error." : messages.at(-1)?.role === "assistant" && messages.at(-1)?.text ? "Response ready." : "") : phase === "reading" ? "Thinking" : phase === "analyzing" ? "Running the analysis" : "Writing the response"

  // The phone keyboard doesn't resize the layout viewport on iOS, so follow the visual one to keep the composer in view.
  useEffect(() => {
    const vv = window.visualViewport
    const el = panelRef.current
    if (!narrow || !vv || !el) return
    const sync = () => {
      el.style.setProperty("--pf-vvh", `${vv.height}px`)
      el.style.setProperty("--pf-vvb", `${Math.max(0, window.innerHeight - vv.height - vv.offsetTop)}px`)
    }
    sync()
    vv.addEventListener("resize", sync)
    vv.addEventListener("scroll", sync)
    return () => {
      vv.removeEventListener("resize", sync)
      vv.removeEventListener("scroll", sync)
    }
  }, [narrow])

  // Closing returns focus to where the person started.
  useEffect(
    () => () => {
      window.setTimeout(() => document.querySelector<HTMLElement>(".pf-ai-launch")?.focus({ preventScroll: true }), 60)
    },
    [],
  )

  const onScroll = () => {
    const el = scroller.current
    if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 140
  }

  const size = expanded ? expandedSize() : { w: geo.w, h: geo.h }
  const ask = useCallback(
    (q: string) => {
      stick.current = true
      send(q)
    },
    [send],
  )

  const style = narrow
    ? undefined
    : { width: size.w, height: size.h, right: expanded ? Math.max(EDGE, (viewport().vw - size.w) / 2) : geo.right, bottom: expanded ? Math.max(EDGE, (viewport().vh - size.h) / 2) : geo.bottom }

  return (
    <motion.section
      ref={panelRef}
      role="dialog"
      aria-label="Peerfolio Intelligence"
      className={`pf-ai-win ${narrow ? "is-sheet" : ""} ${expanded ? "is-expanded" : ""} ${morph ? "is-morph" : ""} ${busy ? "is-busy" : ""} ${interacting ? "is-live" : ""}`}
      style={style}
      initial={narrow ? { y: "100%" } : { opacity: 0, y: 16, scale: 0.96 }}
      animate={narrow ? { y: 0 } : { opacity: 1, y: 0, scale: 1 }}
      exit={narrow ? { y: "100%" } : { opacity: 0, y: 10, scale: 0.97 }}
      transition={{ type: "spring", stiffness: 380, damping: 36, mass: 0.9 }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose()
      }}
    >
      {!narrow && !expanded ? <div className="pf-ai-grip" onPointerDown={begin("size")} onPointerMove={track} onPointerUp={end} onPointerCancel={end} aria-hidden title="Resize" /> : null}

      <header
        className="pf-ai-head"
        onPointerDown={begin("move")}
        onPointerMove={track}
        onPointerUp={end}
        onPointerCancel={end}
        onKeyDown={nudge}
        tabIndex={narrow || expanded ? -1 : 0}
        aria-label="Assistant window. Alt and arrow keys move it; Alt, Shift and arrow keys resize it."
        onDoubleClick={(e) => {
          if (!narrow && !(e.target as HTMLElement).closest("button")) setExpanded(!expanded)
        }}
      >
        {narrow ? <span className="pf-ai-handle" aria-hidden /> : null}
        <Orb size={22} phase={phase} />
        <div className="pf-ai-title">
          <span className="pf-ai-name">Peerfolio Intelligence</span>
          <span className="pf-ai-ctx">{PAGE_LABEL[page]}</span>
        </div>
        <div className="pf-ai-actions">
          {messages.length > 0 ? (
            <button type="button" className="pf-ai-ib" onClick={reset} aria-label="New conversation" title="New conversation">
              <SquarePen size={15} />
            </button>
          ) : null}
          <button type="button" className="pf-ai-ib" onClick={() => setExpanded(!expanded)} aria-label={expanded ? "Restore size" : "Expand"} title={expanded ? "Restore size" : "Expand"}>
            {expanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>
          <button type="button" className="pf-ai-ib" onClick={onClose} aria-label="Minimize" title="Minimize (Esc)">
            <Minus size={16} />
          </button>
        </div>
      </header>

      <div className="pf-ai-sr" role="status" aria-live="polite">
        {announce}
      </div>
      <div className="pf-ai-body" ref={scroller} onScroll={onScroll} role="region" aria-label="Conversation" tabIndex={-1}>
        {messages.length === 0 ? (
          <EmptyState onPick={ask} />
        ) : (
          <div className="pf-ai-thread">
            {messages.map((m, i) => (
              <Message key={m.id} m={m} last={i === messages.length - 1} phase={phase} busy={busy} onAsk={ask} onRetry={retry} />
            ))}
          </div>
        )}
      </div>

      <Composer busy={busy} onSend={ask} onStop={cancel} page={PAGE_LABEL[page]} />
    </motion.section>
  )
}

function EmptyState({ onPick }: { onPick: (q: string) => void }) {
  const { page } = useAssistant()
  const items = suggestionsFor(page)
  return (
    <motion.div className="pf-ai-empty" initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.05, delayChildren: 0.08 } } }}>
      <motion.div variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}>
        <Orb size={44} />
      </motion.div>
      <motion.h3 variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}>What would you like to understand?</motion.h3>
      <motion.p variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}>I can read your holdings and explain what they show.</motion.p>
      <div className="pf-ai-sugs">
        {items.map((s, i) => (
          <motion.button
            key={s.label}
            type="button"
            style={{ "--i": i } as React.CSSProperties}
            className={`pf-ai-sug ${s.featured ? "is-featured" : ""}`}
            variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}
            onClick={() => onPick(s.label)}
          >
            <span>{s.label}</span>
            <ArrowUp size={13} className="pf-ai-sug-ic" aria-hidden />
          </motion.button>
        ))}
      </div>
    </motion.div>
  )
}

const STAGES = [
  { key: "reading", label: "Reading your holdings" },
  { key: "analyzing", label: "Running the analysis" },
  { key: "writing", label: "Writing the summary" },
] as const

/** Shown once a tool is genuinely running; each step is a real phase of the request, not a timer. */
function Progress({ phase }: { phase: Phase }) {
  const at = STAGES.findIndex((s) => s.key === phase)
  return (
    <ol className="pf-ai-prog" aria-label="Analysis progress">
      {STAGES.map((s, i) => {
        const state = i < at ? "done" : i === at ? "now" : "next"
        return (
          <motion.li key={s.key} className={`is-${state}`} initial={{ opacity: 0, x: -4 }} animate={{ opacity: state === "next" ? 0.4 : 1, x: 0 }} transition={{ delay: i * 0.06, duration: 0.25 }}>
            <span className="pf-ai-pn">{state === "done" ? <Check size={11} strokeWidth={2.5} /> : String(i + 1).padStart(2, "0")}</span>
            <span className={state === "now" ? "pf-ai-shimmer" : undefined}>{s.label}</span>
          </motion.li>
        )
      })}
    </ol>
  )
}

/** The report's outline while its numbers are computed, so the real report replaces it in place. */
function ReportSkeleton() {
  return (
    <motion.div className="pf-sk-xr" aria-hidden initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }}>
      <span className="pf-sk-b is-hero" />
      <div className="pf-sk-row">
        <span className="pf-sk-b" />
        <span className="pf-sk-b" />
        <span className="pf-sk-b" />
      </div>
      <span className="pf-sk-b is-bar" />
      <span className="pf-sk-b" style={{ width: "72%" }} />
      <span className="pf-sk-b" style={{ width: "58%" }} />
    </motion.div>
  )
}

function Message({ m, last, phase, busy, onAsk, onRetry }: { m: Msg; last: boolean; phase: Phase; busy: boolean; onAsk: (q: string) => void; onRetry: () => void }) {
  if (m.role === "user") {
    return (
      <motion.div className="pf-ai-user" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 420, damping: 34 }}>
        {m.text}
      </motion.div>
    )
  }
  const working = last && busy
  const showProgress = working && (phase === "analyzing" || (phase === "writing" && !!m.xray))
  return (
    <div className="pf-ai-bot">
      {showProgress && !m.xray ? (
        <>
          <Progress phase={phase} />
          <ReportSkeleton />
        </>
      ) : null}
      {working && !showProgress && !m.text && !m.xray ? (
        <div className="pf-ai-think" role="status">
          <Orb size={16} phase={phase} />
          <span className="pf-ai-shimmer">Thinking</span>
        </div>
      ) : null}
      {m.xray ? <XRayReport xray={m.xray} onAsk={onAsk} /> : null}
      {m.text ? (
        <p className="pf-ai-text">
          {m.text}
          {working && phase === "writing" ? <span className="pf-ai-caret" aria-hidden /> : null}
        </p>
      ) : null}
      {m.error ? (
        <div className="pf-ai-err" role="alert">
          <span>{m.error}</span>
          {last && !busy ? (
            <button type="button" onClick={onRetry}>
              <RotateCcw size={12} /> Try again
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function Composer({ busy, onSend, onStop, page }: { busy: boolean; onSend: (q: string) => void; onStop: () => void; page: string }) {
  const [value, setValue] = useState("")
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    // After the first paint: focusing during the enter transition can be dropped.
    const frame = requestAnimationFrame(() => ref.current?.focus({ preventScroll: true }))
    return () => cancelAnimationFrame(frame)
  }, [])

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight, 132)}px`
  }, [value])

  const submit = () => {
    if (!value.trim() || busy) return
    onSend(value)
    setValue("")
  }

  return (
    <footer className="pf-ai-foot">
      <div className={`pf-ai-box ${busy ? "is-busy" : ""}`}>
        <textarea
          ref={ref}
          value={value}
          rows={1}
          maxLength={2000}
          placeholder="Ask about your portfolio…"
          aria-label="Message Peerfolio Intelligence"
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              submit()
            }
          }}
        />
        {busy ? (
          <button type="button" className="pf-ai-send is-stop" onClick={onStop} aria-label="Stop generating">
            <Square size={11} fill="currentColor" />
          </button>
        ) : (
          <button type="button" className="pf-ai-send" onClick={submit} disabled={!value.trim()} aria-label="Send">
            <ArrowUp size={15} strokeWidth={2.25} />
          </button>
        )}
      </div>
      <div className="pf-ai-meta">
        <span className="pf-ai-chip">{page}</span>
        <span>AI can be wrong. Not investment advice.</span>
      </div>
    </footer>
  )
}
