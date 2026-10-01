"use client"

import { useEffect, useState } from "react"

/**
 * The viewer's background choice, kept in this browser. Cosmetic, so local
 * storage is enough: no account round-trip, and it applies before data loads.
 */
export const BACKGROUNDS = [
  { id: "classic", label: "Classic", note: "Today's quiet dots" },
  { id: "alive", label: "Alive grid", note: "Cells blink like the landing page" },
  { id: "market", label: "Market mood", note: "Rises on up days, sinks on down days" },
  { id: "topo", label: "Topographic", note: "Contours that drift and scroll" },
  { id: "depth", label: "Order book", note: "Live ladders in the margins" },
  { id: "glyph", label: "Glyph field", note: "Market type lit by colour" },
  { id: "horizon", label: "Horizon", note: "Your returns as a landscape" },
  { id: "orbit", label: "Orbit", note: "Your league in orbit" },
] as const

export type BackgroundId = (typeof BACKGROUNDS)[number]["id"]
export type BackgroundPref = { id: BackgroundId; interactive: boolean }

const KEY = "peerfolio:background"
const EVENT = "peerfolio:background"
const DEFAULT: BackgroundPref = { id: "classic", interactive: true }

export function readBackground(): BackgroundPref {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null")
    if (v && BACKGROUNDS.some((b) => b.id === v.id)) return { id: v.id, interactive: v.interactive !== false }
  } catch {}
  return DEFAULT
}

export function writeBackground(pref: BackgroundPref) {
  try {
    localStorage.setItem(KEY, JSON.stringify(pref))
  } catch {}
  window.dispatchEvent(new CustomEvent(EVENT))
}

/** Current preference, updated live when changed anywhere in the app. */
export function useBackground(): [BackgroundPref | null, (p: BackgroundPref) => void] {
  const [pref, setPref] = useState<BackgroundPref | null>(null)
  useEffect(() => {
    const sync = () => setPref(readBackground())
    sync()
    window.addEventListener(EVENT, sync)
    window.addEventListener("storage", sync)
    return () => {
      window.removeEventListener(EVENT, sync)
      window.removeEventListener("storage", sync)
    }
  }, [])
  return [pref, writeBackground]
}
