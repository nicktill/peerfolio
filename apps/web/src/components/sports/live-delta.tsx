"use client"

import { useEffect, useRef, useState } from "react"
import { deltaLabel, deltaTone, freshSeen, numberDelta, priceDelta, type Delta, type DeltaKind, type Seen } from "@web/lib/sports/delta"

const SHOW_MS = 2500
const PREFIX = "pf-ld:"

function readSeen(key: string | undefined): number | null {
  if (!key) return null
  try {
    const raw = window.sessionStorage.getItem(PREFIX + key)
    return raw ? freshSeen(JSON.parse(raw) as Seen, Date.now()) : null
  } catch { return null }
}
function writeSeen(key: string | undefined, v: number) {
  if (!key) return
  try { window.sessionStorage.setItem(PREFIX + key, JSON.stringify({ v, t: Date.now() } satisfies Seen)) } catch { /* private mode or blocked storage */ }
}

export type Change = { id: number; delta: Delta; from: number }

/**
 * Reports how `value` changed since it was last seen. A change that lands while the tab is hidden is held back and
 * replayed as one net change when the tab is visible again; `seenKey` also remembers the value across remounts this session.
 */
export function useDelta(value: number | null | undefined, kind: DeltaKind, seenKey?: string): Change | null {
  const [change, setChange] = useState<Change | null>(null)
  const seen = useRef<number | null>(null)
  const latest = useRef(value)
  const counter = useRef(0)
  latest.current = value

  useEffect(() => {
    const check = () => {
      const next = latest.current
      if (next == null || document.visibilityState === "hidden") return
      const prev = seen.current ?? readSeen(seenKey)
      seen.current = next
      writeSeen(seenKey, next)
      const delta = kind === "price" ? priceDelta(prev, next) : numberDelta(prev, next)
      if (delta && prev != null) setChange({ id: ++counter.current, delta, from: prev })
    }
    check()
    document.addEventListener("visibilitychange", check)
    return () => document.removeEventListener("visibilitychange", check)
  }, [value, kind, seenKey])

  useEffect(() => {
    if (!change) return
    const t = window.setTimeout(() => setChange((c) => (c?.id === change.id ? null : c)), SHOW_MS)
    return () => window.clearTimeout(t)
  }, [change])

  return change
}

/**
 * A number that rolls in the direction it moved, flashes, and shows a small delta chip beside it that fades.
 * The chip is absolutely positioned (no layout shift) and hidden from assistive tech; `text` is always the real value.
 */
export function LiveNumber({ value, format, kind, seenKey, chip = true, className }: { value: number | null | undefined; format: (v: number) => string; kind: DeltaKind; seenKey?: string; chip?: boolean; className?: string }) {
  const change = useDelta(value, kind, seenKey)
  const text = value == null ? "\u2013" : format(value)
  const tone = change ? deltaTone(change.delta, kind) : undefined
  const before = change ? format(change.from) : null
  return (
    <span className={`ld${className ? ` ${className}` : ""}`} data-flash={tone} data-dir={change?.delta.dir} data-kind={kind}>
      <span key={change?.id ?? 0} className="ld-in">{text}</span>
      {change && before !== text ? <span key={`o${change.id}`} className="ld-out" aria-hidden>{before}</span> : null}
      {change && chip && kind !== "pct" ? <span key={`c${change.id}`} className="ld-chip" data-tone={tone} aria-hidden>{deltaLabel(change.delta, kind)}</span> : null}
    </span>
  )
}
