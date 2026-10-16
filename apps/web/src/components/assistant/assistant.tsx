"use client"

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import Link from "next/link"
import { AnimatePresence, MotionConfig, animate, motion, useDragControls, useMotionValue, useReducedMotion } from "motion/react"
import { AppWindow, ArrowUp, ChevronLeft, ArrowUpRight, Check, Copy, FileText, Maximize2, MessageSquare, Minimize2, Minus, PanelRight, RefreshCw, RotateCcw, Square, SquarePen, X } from "lucide-react"
import { OPEN_EVENT } from "@web/components/assistant/open-event"
import { Orb } from "@web/components/assistant/orb"
import { PAGE_LABEL, copyFor, useAssistant, type Msg, type Page, type Phase } from "@web/components/assistant/use-assistant"
import { XRayReport } from "@web/components/assistant/xray-report"
import { VisualCard } from "@web/components/assistant/visuals"
import { Markdown } from "@web/components/assistant/markdown"
import { readAssistantView } from "@web/components/assistant/view-context"
import { splitFollowUps } from "@web/lib/ai/followups"
import { fallbackFollowUps } from "@web/lib/ai/fallbacks"
import { domainOf, knownSet, collectUrls, type Source } from "@web/lib/ai/sources"
import { nextRevealed } from "@web/lib/ai/reveal"
import { formatCurrency } from "@web/lib/format"
import type { XRay } from "@web/lib/ai/portfolio-xray"
import { isWealthHref } from "@web/lib/wealth/link"
import { useApi } from "@web/lib/use-api"
import "@web/components/assistant/assistant.css"

// v2: the window now opens centred and is resizable from its first card; older saved positions are dropped.
const GEO_KEY = "pf-assistant-geo-v3"
const DOCK_KEY = "pf-assistant-dock-v1"
const TUCK_KEY = "pf-assistant-tucked-v1"
/** Docking squeezes the page, so it needs room: below this width the window floats instead. */
const DOCK_MIN_VIEWPORT = 1100
const DOCK_WIDTH = 400
const DOCK_WIDE = 680
const DOCK_MIN = 340
const DOCK_WIDTH_KEY = "pf-assistant-dockw-v1"
const MIN = { w: 340, h: 400 }
const COMPACT = { w: 600, h: 540 }
const EDGE = 12

type Edge = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw"
const EDGES: Edge[] = ["n", "s", "e", "w", "ne", "nw", "se", "sw"]

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
  // First open: centred, so it reads as a window to work in rather than a corner widget.
  const w = Math.min(COMPACT.w, window.innerWidth - EDGE * 2)
  const h = Math.min(COMPACT.h, window.innerHeight - EDGE * 2)
  const fallback: Geo = { w, h, right: Math.max(EDGE, (window.innerWidth - w) / 2), bottom: Math.max(EDGE, (window.innerHeight - h) / 2), expanded: false }
  try {
    const saved = JSON.parse(localStorage.getItem(GEO_KEY) ?? "null") as Partial<Geo> | null
    if (saved && [saved.w, saved.h, saved.right, saved.bottom].every((n) => typeof n === "number" && Number.isFinite(n))) {
      // Size and place are remembered; "expanded" is not, so it opens small and grows when there's something to show.
      return fit({ ...fallback, ...saved, expanded: false })
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

const subscribeWide = (cb: () => void) => {
  const mq = window.matchMedia(`(min-width: ${DOCK_MIN_VIEWPORT}px)`)
  mq.addEventListener("change", cb)
  return () => mq.removeEventListener("change", cb)
}
const useWide = () => useSyncExternalStore(subscribeWide, () => window.matchMedia(`(min-width: ${DOCK_MIN_VIEWPORT}px)`).matches, () => false)

const isMac = () => typeof navigator !== "undefined" && /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent)

/** Mounted for every signed-in user; renders nothing unless the server says the assistant is usable. */
export function AssistantRoot() {
  const status = useApi<{ available: boolean }>("/api/assistant/status")
  return status.data?.available ? <AssistantInner /> : null
}

function AssistantInner() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key === "/") {
        e.preventDefault()
        setOpen((v) => !v)
      }
    }
    // The sidebar's "Ask anything" item opens the window the same way the shortcut does.
    const onNav = () => setOpen(true)
    window.addEventListener("keydown", onKey)
    window.addEventListener(OPEN_EVENT, onNav)
    return () => {
      window.removeEventListener("keydown", onKey)
      window.removeEventListener(OPEN_EVENT, onNav)
    }
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

  // Where the sidebar is hidden the pill can be swiped off to the right edge, where it rests as a slim nub; swipe it back or tap it.
  const narrow = useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia("(max-width: 860px)")
      mq.addEventListener("change", cb)
      return () => mq.removeEventListener("change", cb)
    },
    () => window.matchMedia("(max-width: 860px)").matches,
    () => false,
  )
  const [tucked, setTucked] = useState(false)
  useEffect(() => {
    try {
      setTucked(localStorage.getItem(TUCK_KEY) === "1")
    } catch {
      // Not remembered.
    }
  }, [])
  const tuck = (next: boolean) => {
    setTucked(next)
    try {
      localStorage.setItem(TUCK_KEY, next ? "1" : "0")
    } catch {
      // Not remembered; it still works for this visit.
    }
  }
  const nub = narrow && tucked
  return (
    <motion.button
      type="button"
      className={`pf-ai-launch ${nub ? "is-nub" : ""}`}
      onClick={() => {
        if (nub) tuck(false)
        onOpen()
      }}
      drag={narrow ? "x" : false}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={nub ? { left: 0.6, right: 0 } : { left: 0, right: 0.6 }}
      dragSnapToOrigin
      onDragEnd={(_, info) => {
        if (!nub && (info.offset.x > 48 || info.velocity.x > 420)) tuck(true)
        else if (nub && (info.offset.x < -24 || info.velocity.x < -300)) tuck(false)
      }}
      initial={{ opacity: 0, y: 12, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.96 }}
      transition={{ type: "spring", stiffness: 420, damping: 34 }}
      whileTap={{ scale: 0.97 }}
      aria-label={nub ? "Open Peerfolio Intelligence (tucked away)" : "Open Peerfolio Intelligence. Swipe right to tuck it away."}
      aria-keyshortcuts="Control+Slash Meta+Slash"
    >
      {nub ? <ChevronLeft size={14} aria-hidden /> : null}
      <Orb size={nub ? 16 : 20} phase={phase} />
      {nub ? null : <span className="pf-ai-launch-t">{busy ? "Working…" : "Ask Peerfolio"}</span>}
      {hint && !nub ? <kbd className="pf-ai-kbd">{hint}</kbd> : null}
    </motion.button>
  )
}

function Panel({ onClose }: { onClose: () => void }) {
  const narrow = useNarrow()
  const wide = useWide()
  const { messages, phase, activity, steps, busy, page, send, cancel, retry, reset, reportSeq } = useAssistant()
  // Web addresses that may be shown as links: seen in tool results or search citations, or typed by the person.
  const known = useMemo(() => knownSet(messages.flatMap((m) => (m.role === "user" ? collectUrls(m.text) : (m.sources ?? []).map((x) => x.url)))), [messages])
  const [geo, setGeo] = useState<Geo>(() => loadGeo())
  const [dockPref, setDockPref] = useState<boolean>(() => {
    try {
      return localStorage.getItem(DOCK_KEY) === "1"
    } catch {
      return false
    }
  })
  const canDock = !narrow && wide
  const docked = dockPref && canDock
  const toggleDock = () => {
    const next = !dockPref
    setDockPref(next)
    try {
      localStorage.setItem(DOCK_KEY, next ? "1" : "0")
    } catch {
      // Not remembered; it still works for this visit.
    }
  }

  // The docked width is the person's to set: drag the left edge (or use the arrow keys on it).
  const [dockW, setDockW] = useState<number>(() => {
    try {
      const saved = Number(localStorage.getItem(DOCK_WIDTH_KEY))
      return Number.isFinite(saved) && saved >= DOCK_MIN ? saved : DOCK_WIDTH
    } catch {
      return DOCK_WIDTH
    }
  })
  // Never narrower than a readable column, never more than 60% of the window (the page narrows to match).
  const dockMax = () => Math.max(DOCK_MIN, Math.floor(window.innerWidth * 0.6))
  const dockWidth = Math.min(Math.max(dockW, DOCK_MIN), dockMax())
  const dockWide = dockWidth >= DOCK_WIDE - 40
  const saveDockW = (next: number) => {
    try {
      localStorage.setItem(DOCK_WIDTH_KEY, String(Math.round(next)))
    } catch {
      // Not remembered; it still works for this visit.
    }
  }
  const toggleDockWide = () => {
    const next = dockWide ? DOCK_WIDTH : DOCK_WIDE
    setDockW(next)
    saveDockW(next)
  }
  const dockDrag = useRef<{ x: number; w: number } | null>(null)
  const dockGrip = {
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      if (e.button !== 0) return
      e.currentTarget.setPointerCapture(e.pointerId)
      dockDrag.current = { x: e.clientX, w: dockWidth }
      // The page follows the panel live; without this its width transition would lag behind the pointer.
      document.querySelector<HTMLElement>(".peerfolio-app")?.classList.add("dock-live")
      setInteracting(true)
    },
    onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
      const s = dockDrag.current
      if (s) setDockW(Math.min(Math.max(s.w + (s.x - e.clientX), DOCK_MIN), dockMax()))
    },
    onPointerUp: (e: React.PointerEvent<HTMLElement>) => {
      if (!dockDrag.current) return
      dockDrag.current = null
      e.currentTarget.releasePointerCapture(e.pointerId)
      document.querySelector<HTMLElement>(".peerfolio-app")?.classList.remove("dock-live")
      setInteracting(false)
      saveDockW(dockWidth)
    },
    onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return
      e.preventDefault()
      const next = Math.min(Math.max(dockWidth + (e.key === "ArrowLeft" ? 24 : -24), DOCK_MIN), dockMax())
      setDockW(next)
      saveDockW(next)
    },
  }

  // Docked, the page makes room instead of being covered.
  useEffect(() => {
    if (!docked) return
    const app = document.querySelector<HTMLElement>(".peerfolio-app")
    if (!app) return
    app.classList.add("has-dock")
    return () => {
      app.classList.remove("has-dock", "dock-live")
      app.style.removeProperty("--pf-dock-w")
    }
  }, [docked])
  useEffect(() => {
    if (!docked) return
    document.querySelector<HTMLElement>(".peerfolio-app")?.style.setProperty("--pf-dock-w", `${dockWidth}px`)
  }, [docked, dockWidth])
  const [morph, setMorph] = useState(false)
  const [interacting, setInteracting] = useState(false)
  const scroller = useRef<HTMLDivElement>(null)
  const stick = useRef(true)
  const panelRef = useRef<HTMLElement>(null)
  const sheetDrag = useDragControls()
  const sheetY = useMotionValue(0)
  const gesture = useRef<{ kind: "move" | Edge; x: number; y: number; g: Geo } | null>(null)
  const seenReport = useRef(reportSeq)

  // The phone sheet has its own state: a saved desktop "expanded" must not make it open full screen.
  const [sheetUp, setSheetUp] = useState(false)
  const expanded = (narrow ? sheetUp : geo.expanded) && !docked

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
      // A docked panel is already tall: the report just scrolls in it.
      if (!expanded && !docked) setExpanded(true)
    }
  }, [reportSeq, expanded, docked, setExpanded])

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
    if (!el) return
    // The opening card always starts at its top; only a conversation follows its newest line.
    if (messages.length === 0) el.scrollTop = 0
    else if (stick.current) el.scrollTop = el.scrollHeight
  }, [messages, phase])

  const begin = (kind: "move" | Edge) => (e: React.PointerEvent<HTMLElement>) => {
    if (narrow || docked || expanded || e.button !== 0 || (e.target as HTMLElement).closest("button")) return
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
    else {
      // The window is anchored by its right/bottom, so a west/north drag only changes the size and an east/south drag also moves the anchor.
      let { w, h, right, bottom } = s.g
      if (s.kind.includes("w")) w = Math.max(MIN.w, s.g.w - dx)
      if (s.kind.includes("e")) {
        w = Math.max(MIN.w, s.g.w + dx)
        right = s.g.right - (w - s.g.w)
      }
      if (s.kind.includes("n")) h = Math.max(MIN.h, s.g.h - dy)
      if (s.kind.includes("s")) {
        h = Math.max(MIN.h, s.g.h + dy)
        bottom = s.g.bottom - (h - s.g.h)
      }
      setGeo(fit({ ...s.g, w, h, right, bottom }))
    }
  }
  const end = (e: React.PointerEvent<HTMLElement>) => {
    if (!gesture.current) return
    gesture.current = null
    e.currentTarget.releasePointerCapture(e.pointerId)
    setInteracting(false)
  }

  // Keyboard equivalent of dragging: Alt+arrows move the window, Alt+Shift+arrows resize it.
  const nudge = (e: React.KeyboardEvent<HTMLElement>) => {
    if (narrow || docked || expanded || !e.altKey || !e.key.startsWith("Arrow")) return
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

  // Text grows between renders (typing, cards unfolding): keep following the newest line unless the person scrolled up.
  const thread = useRef<HTMLDivElement>(null)
  const hasThread = messages.length > 0
  useEffect(() => {
    const el = thread.current
    const box = scroller.current
    if (!el || !box || typeof ResizeObserver === "undefined") return
    const watch = new ResizeObserver(() => {
      if (stick.current) box.scrollTop = box.scrollHeight
    })
    watch.observe(el)
    return () => watch.disconnect()
  }, [hasThread])

  const onScroll = () => {
    const el = scroller.current
    if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 140
  }

  // Nothing said yet: a small card, not an empty window. It grows (with the same morph) once there's a conversation.
  const launch = messages.length === 0 && !expanded && !docked
  const wasLaunch = useRef(launch)
  useEffect(() => {
    if (wasLaunch.current !== launch) {
      wasLaunch.current = launch
      setMorph(true)
      // Growing from the small card must stay on screen.
      setGeo((g) => fit(g))
      const t = window.setTimeout(() => setMorph(false), 460)
      return () => window.clearTimeout(t)
    }
  }, [launch])
  const size = expanded
    ? expandedSize()
    : { w: geo.w, h: geo.h }
  const ask = useCallback(
    (q: string) => {
      stick.current = true
      send(q)
    },
    [send],
  )

  const style = narrow || docked
    ? undefined
    : { width: size.w, height: size.h, right: expanded ? Math.max(EDGE, (viewport().vw - size.w) / 2) : geo.right, bottom: expanded ? Math.max(EDGE, (viewport().vh - size.h) / 2) : geo.bottom }

  return (
    <>
    {narrow ? <motion.div className="pf-ai-scrim" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.28 }} aria-hidden /> : null}
    <motion.section
      ref={panelRef}
      role="dialog"
      aria-label="Peerfolio Intelligence"
      className={`pf-ai-win ${narrow ? "is-sheet" : ""} ${docked ? "is-docked" : ""} ${expanded ? "is-expanded" : ""} ${launch ? "is-launch" : ""} ${morph ? "is-morph" : ""} ${busy ? "is-busy" : ""} ${interacting ? "is-live" : ""}`}
      style={narrow ? { y: sheetY } : style}
      drag={narrow ? "y" : false}
      dragControls={sheetDrag}
      dragListener={false}
      dragConstraints={{ top: 0, bottom: 0 }}
      dragElastic={{ top: 0, bottom: 0.6 }}
      dragMomentum={false}
      onDragEnd={(_, info) => {
        const dismiss = info.offset.y > 110 || info.velocity.y > 650
        // Settle back unless this is a dismissal: snapping and exiting at once would flicker.
        if (!dismiss || expanded) animate(sheetY, 0, { type: "spring", stiffness: 420, damping: 38 })
        if (dismiss) {
          // A full-screen sheet steps down to the half sheet first, then closes.
          if (expanded) setExpanded(false)
          else onClose()
        }
      }}
      initial={narrow ? { y: "100%" } : docked ? { x: "100%" } : { opacity: 0, y: 16, scale: 0.96 }}
      animate={narrow ? { y: 0 } : docked ? { x: 0, y: 0, opacity: 1, scale: 1 } : { opacity: 1, y: 0, scale: 1, x: 0 }}
      exit={narrow ? { y: "100%" } : docked ? { x: "100%" } : { opacity: 0, y: 10, scale: 0.97 }}
      transition={{ type: "spring", stiffness: 380, damping: 36, mass: 0.9 }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose()
      }}
    >
      {docked ? (
        <div
          className="pf-ai-dockgrip"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize the assistant panel. Arrow keys change its width."
          aria-valuenow={Math.round(dockWidth)}
          aria-valuemin={DOCK_MIN}
          tabIndex={0}
          {...dockGrip}
          onPointerCancel={dockGrip.onPointerUp}
          onDoubleClick={toggleDockWide}
        />
      ) : null}
      {!narrow && !docked && !expanded
        ? EDGES.map((edge) => <div key={edge} className={`pf-ai-edge is-${edge}`} onPointerDown={begin(edge)} onPointerMove={track} onPointerUp={end} onPointerCancel={end} aria-hidden />)
        : null}

      <header
        className="pf-ai-head"
        onPointerDown={(e) => {
          // On a phone the header is the grab area: pulling the sheet down dismisses it, like a native sheet.
          if (narrow && !(e.target as HTMLElement).closest("button")) sheetDrag.start(e)
          else begin("move")(e)
        }}
        onPointerMove={track}
        onPointerUp={end}
        onPointerCancel={end}
        onKeyDown={nudge}
        tabIndex={narrow || docked || expanded ? -1 : 0}
        aria-label={docked ? "Assistant panel" : "Assistant window. Alt and arrow keys move it; Alt, Shift and arrow keys resize it."}
        onDoubleClick={(e) => {
          if (!narrow && !docked && !(e.target as HTMLElement).closest("button")) setExpanded(!expanded)
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
            <button type="button" className="pf-ai-ib" onClick={() => {
                reset()
                // Back to the small card the assistant opens as.
                if (expanded) setExpanded(false)
              }}
              aria-label="New conversation" title="New conversation">
              <SquarePen size={15} />
            </button>
          ) : null}
          {canDock ? (
            <button type="button" className="pf-ai-ib" onClick={toggleDock} aria-label={docked ? "Float the window" : "Dock to the side"} aria-pressed={docked} title={docked ? "Float the window" : "Dock to the side"}>
              {docked ? <AppWindow size={15} /> : <PanelRight size={15} />}
            </button>
          ) : null}
          {docked ? (
            <button type="button" className="pf-ai-ib" onClick={toggleDockWide} aria-label={dockWide ? "Restore size" : "Expand"} aria-pressed={dockWide} title={dockWide ? "Restore size" : "Expand"}>
              {dockWide ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            </button>
          ) : (
            <button type="button" className="pf-ai-ib" onClick={() => setExpanded(!expanded)} aria-label={expanded ? "Restore size" : "Expand"} title={expanded ? "Restore size" : "Expand"}>
              {expanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            </button>
          )}
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
          <div className="pf-ai-thread" ref={thread}>
            {messages.map((m, i) => (
              <Message key={m.id} m={m} last={i === messages.length - 1} phase={phase} activity={activity} steps={steps} known={known} asked={messages.slice(0, i).reverse().find((x) => x.role === "user")?.text ?? ""} busy={busy} onAsk={ask} onRetry={retry} repeatReport={!!m.xray && messages.slice(0, i).some((x) => !!x.xray)} earlierKinds={new Set(messages.slice(0, i).flatMap((x) => (x.visuals ?? []).map((v) => v.kind)))} />
            ))}
          </div>
        )}
      </div>

      <Composer busy={busy} onSend={ask} onStop={cancel} page={`${PAGE_LABEL[page]}${page === "portfolio" && readAssistantView().range ? ` · ${readAssistantView().range}` : ""}`} placeholder={PLACEHOLDER[page]} />
    </motion.section>
    </>
  )
}

/** What the assistant can see on the portfolio page: linked accounts first, since those are the real ones. */
function ScopePill() {
  const { data } = useApi<{ linked: number; manual: number }>("/api/assistant/scope")
  if (!data) return null
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`
  const [tone, text] =
    data.linked > 0 ? ["", `${plural(data.linked, "account")} connected`] : data.manual > 0 ? ["is-manual", `${plural(data.manual, "manual account")}`] : ["is-none", "No accounts yet"]
  return (
    <motion.div className={`pf-ai-scope ${tone}`} role="status" variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}>
      <i aria-hidden />
      {text}
    </motion.div>
  )
}

function EmptyState({ onPick }: { onPick: (q: string) => void }) {
  const { page, detail, recent, openRecent, removeRecent } = useAssistant()
  const copy = copyFor(page, detail)
  const items = copy.suggestions
  return (
    <motion.div key={`${page}:${detail}`} className="pf-ai-empty" initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.05, delayChildren: 0.08 } } }}>
      <motion.div variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}>
        <Orb size={44} />
      </motion.div>
      <motion.h3 variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}>{copy.title}</motion.h3>
      <motion.p variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}>{copy.subtitle}</motion.p>
      {page === "portfolio" ? (
        <ScopePill />
      ) : copy.note ? (
        <motion.div className="pf-ai-scope is-none" variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}>
          <i aria-hidden />
          {copy.note}
        </motion.div>
      ) : null}
      <div className="pf-ai-sugs" style={page === "portfolio" || copy.note ? { marginTop: 14 } : undefined}>
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
      {recent.length > 0 ? (
        <motion.div className="pf-ai-recent" variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }} aria-label="Recent">
          <span className="pf-ai-recent-h">Recent</span>
          {recent.map((r) => (
            <div key={`${r.kind}:${r.id}`} className="pf-ai-recent-row">
              <button type="button" className="pf-ai-recent-open" onClick={() => openRecent(r.kind, r.id)}>
                {r.kind === "report" ? <FileText size={13} aria-hidden /> : <MessageSquare size={13} aria-hidden />}
                <span className="pf-ai-recent-t">{r.label}</span>
                <span className="pf-ai-recent-d">{relativeDay(r.at)}</span>
              </button>
              <button type="button" className="pf-ai-recent-x" onClick={() => removeRecent(r.kind, r.id)} aria-label={`Delete ${r.label}`} title="Delete">
                <X size={12} />
              </button>
            </div>
          ))}
        </motion.div>
      ) : null}
    </motion.div>
  )
}

/** "Today", "Yesterday", or a short date: the quiet timestamp on a saved item. */
function relativeDay(at: number): string {
  const days = Math.floor((Date.now() - at) / 86_400_000)
  if (days <= 0) return "Today"
  if (days === 1) return "Yesterday"
  return new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

/**
 * Before the first word: what the assistant is doing, in plain language. Finished steps stay above as quiet ticks
 * and the current one shimmers, so a slow turn with several tools reads as a short plan being carried out.
 */
function Thinking({ phase, activity, steps }: { phase: Phase; activity: string | null; steps: string[] }) {
  const [slow, setSlow] = useState(0)
  useEffect(() => {
    const a = window.setTimeout(() => setSlow(1), 2800)
    const b = window.setTimeout(() => setSlow(2), 7000)
    return () => {
      window.clearTimeout(a)
      window.clearTimeout(b)
    }
  }, [])
  const text = activity ?? (phase === "writing" ? "Writing" : slow === 0 ? "Thinking" : slow === 1 ? "Thinking it through" : "Still working on this")
  return (
    <motion.div className="pf-ai-think" role="status" aria-live="polite" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -2, transition: { duration: 0.15 } }} transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}>
      {steps.length > 0 ? (
        <ol className="pf-ai-steps" aria-label="Steps done">
          {steps.map((step) => (
            <motion.li key={step} initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
              <Check size={11} strokeWidth={2.5} aria-hidden />
              {step}
            </motion.li>
          ))}
        </ol>
      ) : null}
      <div className="pf-ai-think-row">
        <Orb size={18} phase={phase} />
        <span className="pf-ai-think-t">
          <AnimatePresence mode="wait" initial={false}>
            <motion.span key={text} className="pf-ai-shimmer" initial={{ opacity: 0, y: 5, filter: "blur(3px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} exit={{ opacity: 0, y: -5, filter: "blur(3px)" }} transition={{ duration: 0.22 }}>
              {text}
            </motion.span>
          </AnimatePresence>
          <span className="pf-ai-dots" aria-hidden>
            <i />
            <i />
            <i />
          </span>
        </span>
      </div>
    </motion.div>
  )
}

/** The web pages a search-backed answer cites: small chips with the site's icon and name. */
function SourceChips({ sources }: { sources: Source[] }) {
  const cited = sources.filter((s) => s.cited).slice(0, 4)
  if (cited.length === 0) return null
  return (
    <div className="pf-ai-srcs" role="group" aria-label="Sources">
      {cited.map((s) => (
        <SourceChip key={s.url} source={s} />
      ))}
    </div>
  )
}

function SourceChip({ source }: { source: Source }) {
  const domain = domainOf(source.url)
  const [broken, setBroken] = useState(false)
  return (
    <a className="pf-ai-src" href={source.url} target="_blank" rel="noopener noreferrer" title={source.title ?? domain}>
      {broken || !domain ? (
        <span className="pf-ai-src-ic" aria-hidden>
          {(domain[0] ?? "?").toUpperCase()}
        </span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- a 14px site icon from the cited site itself
        <img className="pf-ai-src-ic" src={`https://${domain}/favicon.ico`} alt="" width={14} height={14} loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} />
      )}
      <span>{domain}</span>
      <span className="pf-ai-sr"> (opens in a new tab)</span>
    </a>
  )
}

/** A report that already appeared earlier in this chat: one quiet line, with the full report a click away. */
function CollapsedReport({ xray, onAsk, onSave }: { xray: XRay; onAsk: (q: string) => void; onSave: () => void }) {
  const [open, setOpen] = useState(false)
  if (open) return <XRayReport xray={xray} onAsk={onAsk} onSave={onSave} />
  return (
    <button type="button" className="pf-xr-collapsed" onClick={() => setOpen(true)} aria-expanded={false}>
      <span className="pf-xr-label">Portfolio X-Ray</span>
      <span className="pf-xr-collapsed-v">{formatCurrency(xray.overview.totalValue)}</span>
      <span className="pf-xr-collapsed-a">Show full report</span>
    </button>
  )
}

/**
 * Smooth typing: the text on screen trails the text received, a few characters per frame, so bursts from the
 * network read as steady typing. It catches up quickly when far behind and shows everything at once for people
 * who prefer reduced motion, and for answers that were already finished when the window opened.
 */
function useTyped(text: string, live: boolean) {
  const reduce = useReducedMotion()
  const [shown, setShown] = useState(live && !reduce ? 0 : text.length)
  const target = useRef(text)
  const at = useRef(shown)
  target.current = text
  const instant = !!reduce || (!live && at.current >= text.length)

  useEffect(() => {
    if (instant) {
      at.current = text.length
      setShown(text.length)
      return
    }
    let frame = 0
    let last = performance.now()
    const tick = (now: number) => {
      const next = nextRevealed(target.current, at.current, now - last)
      last = now
      if (next !== at.current) {
        at.current = next
        setShown(next)
      }
      // Keep going while text is waiting or more may still arrive.
      if (at.current < target.current.length) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
    // Restart the loop whenever new text lands; it stops itself once caught up.
  }, [text, instant])

  const visible = instant ? text.length : Math.min(shown, text.length)
  return { text: visible >= text.length ? text : text.slice(0, visible), typing: visible < text.length }
}

/** Copy, regenerate: the quiet row under a finished answer. */
function Actions({ text, canRegenerate, onRegenerate }: { text: string; canRegenerate: boolean; onRegenerate: () => void }) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const t = window.setTimeout(() => setCopied(false), 1600)
    return () => window.clearTimeout(t)
  }, [copied])
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // Clipboard access can be refused (insecure context, permissions): fall back to a selection copy.
      const area = document.createElement("textarea")
      area.value = text
      area.setAttribute("readonly", "")
      area.style.position = "fixed"
      area.style.opacity = "0"
      document.body.appendChild(area)
      area.select()
      try {
        document.execCommand("copy")
      } catch {
        area.remove()
        return
      }
      area.remove()
    }
    setCopied(true)
  }
  return (
    <div className="pf-ai-acts" role="group" aria-label="Answer actions">
      <button type="button" className={`pf-ai-act ${copied ? "is-done" : ""}`} onClick={copy} aria-label={copied ? "Copied" : "Copy answer"} title="Copy answer">
        {copied ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />}
        {copied ? "Copied" : "Copy"}
      </button>
      {canRegenerate ? (
        <button type="button" className="pf-ai-act" onClick={onRegenerate} aria-label="Regenerate answer" title="Regenerate answer">
          <RefreshCw size={13} aria-hidden />
          Regenerate
        </button>
      ) : null}
    </div>
  )
}

function Message({ m, last, phase, activity, steps, known, asked, busy, onAsk, onRetry, repeatReport = false, earlierKinds }: { m: Msg; last: boolean; phase: Phase; activity: string | null; steps: string[]; known: Set<string>; asked: string; busy: boolean; onAsk: (q: string) => void; onRetry: () => void; repeatReport?: boolean; earlierKinds?: Set<string> }) {
  const { saveReport, page } = useAssistant()
  const working = last && busy
  // The reply is drawn through the typing pace; the follow-up trailer is lifted out of it before anything is drawn.
  const { body, followUps } = splitFollowUps(m.text)
  const typed = useTyped(body, working)
  if (m.role === "user") {
    return (
      <motion.div className="pf-ai-user" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 420, damping: 34 }}>
        {m.text}
      </motion.div>
    )
  }
  const streaming = working || typed.typing
  const done = last && !busy && !typed.typing
  // When the model leaves its suggestions out (or garbles them), the page's own still give a next step.
  const suggestions = followUps.length >= 2 ? followUps : body ? fallbackFollowUps(page, asked) : []
  return (
    <div className="pf-ai-bot">
      <AnimatePresence initial={false}>{working && !body && !m.xray ? <Thinking key="think" phase={phase} activity={activity} steps={steps} /> : null}</AnimatePresence>
      {m.xray ? repeatReport ? <CollapsedReport xray={m.xray} onAsk={onAsk} onSave={() => saveReport(m.xray!)} /> : <XRayReport xray={m.xray} onAsk={onAsk} onSave={() => saveReport(m.xray!)} showChips={!working && !m.text} /> : null}
      {typed.text ? <Markdown text={typed.text} streaming={streaming} caret={streaming && !m.error} known={known} /> : null}
      {!streaming && m.sources ? <SourceChips sources={m.sources} /> : null}
      {m.visuals?.map((v) => (
        <VisualCard key={v.kind} v={v} repeat={earlierKinds?.has(v.kind)} />
      ))}
      {m.link && isWealthHref(m.link.href) && !streaming ? (
        <Link href={m.link.href} className="pf-ai-link">
          {m.link.label} <ArrowUpRight size={12} aria-hidden />
        </Link>
      ) : null}
      {m.stopped && !busy ? <p className="pf-ai-stopped">{body ? "Stopped." : "Stopped before an answer."}</p> : null}
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
      {!streaming && !m.error && body && !(m.xray && !m.text) ? <Actions text={body} canRegenerate={last && !busy} onRegenerate={onRetry} /> : null}
      {done && !m.error && !m.stopped && suggestions.length > 0 ? (
        <div className="pf-ai-next" role="group" aria-label="Suggested follow-up questions">
          {suggestions.map((q, i) => (
            <button key={q} type="button" className="pf-ai-next-chip" style={{ "--i": i } as React.CSSProperties} onClick={() => onAsk(q)}>
              <ArrowUp size={12} className="pf-ai-sug-ic" aria-hidden />
              {q}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

const PLACEHOLDER: Record<Page, string> = {
  portfolio: "Ask about your portfolio…",
  news: "Ask about the market or today's news…",
  leagues: "Ask about your league…",
  fantasy: "Ask about your fantasy league…",
  wealth: "Ask a what-if…",
  board: "Ask about your portfolio…",
  other: "Ask about your portfolio…",
}

function Composer({ busy, onSend, onStop, page, placeholder }: { busy: boolean; onSend: (q: string) => void; onStop: () => void; page: string; placeholder: string }) {
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
          placeholder={placeholder}
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
