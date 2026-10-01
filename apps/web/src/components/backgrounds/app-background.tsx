"use client"

import { useEffect, useState } from "react"
import { cn } from "@web/lib/utils"
import { AtmosphereField } from "./atmosphere-field"
import { DepthField } from "./depth-field"
import { GlyphField } from "./glyph-field"
import { GridField } from "./grid-field"
import { HorizonField } from "./horizon-field"
import { OrbitField } from "./orbit-field"
import { SpineField } from "./spine-field"
import { TopoField } from "./topo-field"

/**
 * DRAFT: the signed-in background, plus a small "lab" panel for comparing the
 * candidates. The panel shows in local development and on Vercel previews, or
 * anywhere with ?lab=1.
 * Choices live in the URL (?bg=, &mood=) so a view can be shared, and in
 * localStorage so the last pick survives a reload. Once one design is chosen
 * this collapses to that single component and the panel goes away.
 */
const OPTIONS = [
  { id: "market", label: "Market mood" },
  { id: "alive", label: "Alive grid" },
  { id: "topo", label: "Topographic" },
  { id: "depth", label: "Order book" },
  { id: "glyph", label: "Glyph field" },
  { id: "horizon", label: "Horizon" },
  { id: "atmos", label: "Atmosphere" },
  { id: "orbit", label: "Orbit" },
  { id: "spine", label: "Spine" },
] as const
type Choice = (typeof OPTIONS)[number]["id"]
type Mood = "up" | "down"

const STORE = "peerfolio:bg-lab"

function render(choice: Choice) {
  switch (choice) {
    case "alive":
      return <GridField mood="a" />
    case "topo":
      return <TopoField />
    case "depth":
      return <DepthField />
    case "glyph":
      return <GlyphField />
    case "horizon":
      return <HorizonField />
    case "atmos":
      return <AtmosphereField />
    case "orbit":
      return <OrbitField />
    case "spine":
      return <SpineField />
    default:
      return <GridField mood="b" />
  }
}

export function AppBackground() {
  const [choice, setChoice] = useState<Choice>("alive")
  const [mood, setMood] = useState<Mood>("up")
  const [lab, setLab] = useState(false)
  // Bumped on every change so the canvas remounts and re-reads the URL.
  const [version, setVersion] = useState(0)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    let saved: { choice?: Choice; mood?: Mood } = {}
    try {
      saved = JSON.parse(localStorage.getItem(STORE) ?? "{}")
    } catch {}
    const bg = params.get("bg") as Choice | null
    const pick = OPTIONS.some((o) => o.id === bg) ? bg! : saved.choice && OPTIONS.some((o) => o.id === saved.choice) ? saved.choice : "alive"
    const m = (params.get("mood") as Mood | null) ?? saved.mood ?? "up"
    setChoice(pick)
    setMood(m === "down" ? "down" : "up")
    // Local dev and Vercel previews show the panel; production only with ?lab=1.
    setLab(process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_VERCEL_ENV === "preview" || params.get("lab") === "1")
    apply(pick, m === "down" ? "down" : "up")
    setVersion((v) => v + 1)
  }, [])

  const apply = (c: Choice, m: Mood) => {
    const url = new URL(window.location.href)
    url.searchParams.set("bg", c)
    url.searchParams.set("mood", m)
    window.history.replaceState(null, "", url)
    try {
      localStorage.setItem(STORE, JSON.stringify({ choice: c, mood: m }))
    } catch {}
  }

  const change = (c: Choice, m: Mood) => {
    setChoice(c)
    setMood(m)
    apply(c, m)
    setVersion((v) => v + 1)
  }

  return (
    <>
      <div key={version} className="contents">
        {version > 0 ? render(choice) : null}
      </div>
      {lab ? (
        <div data-bg-lab className="fixed bottom-4 right-4 z-50 w-56 rounded-2xl border bg-card/90 p-3 text-xs shadow-xl backdrop-blur">
          <p className="font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">Background lab</p>
          <div className="mt-2 grid gap-0.5">
            {OPTIONS.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => change(o.id, mood)}
                className={cn(
                  "rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-secondary",
                  choice === o.id && "bg-secondary font-semibold text-foreground",
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-1 rounded-lg bg-secondary p-0.5">
            {(["up", "down"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => change(choice, m)}
                className={cn(
                  "rounded-md py-1 font-medium transition-colors",
                  mood === m ? (m === "up" ? "bg-card text-gain-ink shadow-sm" : "bg-card text-loss-ink shadow-sm") : "text-muted-foreground",
                )}
              >
                {m === "up" ? "▲ Up day" : "▼ Down day"}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[10px] leading-snug text-muted-foreground">Light/dark: the sun/moon in the nav.</p>
        </div>
      ) : null}
    </>
  )
}
