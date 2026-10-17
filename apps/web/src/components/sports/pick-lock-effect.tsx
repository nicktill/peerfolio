"use client"

import "./pick-lock-effect.css"
import { useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { Lock } from "lucide-react"
import { AnimatedNumber } from "@web/components/ui/animated-number"

export type PickLockFx = {
  id: number
  color: string
  ink: string
  title: string
  sub: string
  odds: string
  /** Cash before and after the stake leaves it. */
  from: number
  to: number
  /** A longer shot gets a bigger burst. */
  big?: boolean
}

const TOTAL_MS = 1500
const fmt = (n: number) => Math.round(n).toLocaleString()

/**
 * The moment a pick locks: the ticket drops in, gets stamped in the team's colour with a ripple and a
 * burst of confetti, the cash counts down, then the ticket flies into "Your picks". Plays over the page
 * (a portal), so it survives the slip closing. Reduced motion gets a quiet fade of the same ticket.
 */
export function PickLockEffect({ fx, onDone }: { fx: PickLockFx | null; onDone: () => void }) {
  const reduce = useReducedMotion()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  useEffect(() => {
    if (!fx) return
    const t = setTimeout(onDone, reduce ? 900 : TOTAL_MS)
    return () => clearTimeout(t)
  }, [fx, reduce, onDone])

  // Where "Your picks" is, so the ticket can land there (falls back to straight up).
  const target = useMemo(() => {
    if (!fx || typeof document === "undefined") return { x: 0, y: -160 }
    const dest = document.getElementById("sp-yours-title")?.getBoundingClientRect()
    if (!dest) return { x: 0, y: -160 }
    const cx = window.innerWidth / 2
    const cy = window.innerHeight / 2
    return { x: dest.left + 40 - cx, y: Math.min(Math.max(dest.top - cy, -cy + 40), cy - 40) }
  }, [fx])

  const bits = useMemo(() => {
    const n = fx?.big ? 26 : 16
    return Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2 + (i % 3) * 0.2
      const d = 70 + ((i * 37) % 60)
      return { x: Math.cos(a) * d, y: Math.sin(a) * d - 20, r: (i * 53) % 360, w: 5 + (i % 3) * 2, light: i % 2 === 0 }
    })
  }, [fx])

  if (!mounted) return null
  return createPortal(
    <AnimatePresence>
      {fx ? (
        <div key={fx.id} className="plf" style={{ "--tc": fx.color, "--tc-ink": fx.ink } as React.CSSProperties} aria-hidden>
          {reduce ? null : (
            <>
              <motion.span className="plf-ring" initial={{ scale: 0.2, opacity: 0.7 }} animate={{ scale: 9, opacity: 0 }} transition={{ delay: 0.5, duration: 0.7, ease: "easeOut" }} />
              <motion.span className="plf-ring" initial={{ scale: 0.2, opacity: 0.5 }} animate={{ scale: 6, opacity: 0 }} transition={{ delay: 0.62, duration: 0.6, ease: "easeOut" }} />
              {bits.map((b, i) => (
                <motion.i
                  key={i}
                  className="plf-bit"
                  data-light={b.light || undefined}
                  style={{ width: b.w, height: b.w * 1.6 }}
                  initial={{ x: 0, y: 0, opacity: 0, rotate: 0 }}
                  animate={{ x: b.x, y: b.y + 30, opacity: [0, 1, 1, 0], rotate: b.r }}
                  transition={{ delay: 0.5, duration: 0.8, ease: "easeOut" }}
                />
              ))}
            </>
          )}
          <motion.div
            className="plf-ticket"
            style={{ transformPerspective: 700 }}
            initial={reduce ? { opacity: 0 } : { rotateY: 90, y: 0, scale: 1, opacity: 0 }}
            animate={
              reduce
                ? { opacity: [0, 1, 1, 0] }
                : { rotateY: [90, -12, 0, 0, 0], x: [0, 0, 0, 0, target.x], y: [0, 0, 0, 0, target.y], scale: [1, 1, 1, 1, 0.3], opacity: [0, 1, 1, 0] }
            }
            transition={
              reduce
                ? { duration: 0.9, times: [0, 0.2, 0.8, 1] }
                : { duration: TOTAL_MS / 1000, times: [0, 0.18, 0.28, 0.66, 1], ease: "easeOut", opacity: { duration: TOTAL_MS / 1000, times: [0, 0.1, 0.84, 1] } }
            }
          >
            <motion.div className="plf-card" animate={reduce ? undefined : { x: [0, 0, -5, 5, -2, 0, 0], y: [0, 0, 2, -2, 1, 0, 0] }} transition={{ duration: TOTAL_MS / 1000, times: [0, 0.32, 0.36, 0.4, 0.44, 0.5, 1] }}>
              <span className="plf-edge" />
              {reduce ? null : <span className="plf-foil" />}
              <div className="plf-body">
                <b>{fx.title}</b>
                <span>{fx.sub}</span>
              </div>
              <em className="plf-odds">{fx.odds}</em>
              <span className="plf-stubspace" />
              <span className="plf-cash numeric">
                Cash <AnimatedNumber value={fx.to} format={fmt} durationMs={500} key={fx.id} />
              </span>
              {reduce ? null : <motion.span className="plf-ink" initial={{ opacity: 0 }} animate={{ opacity: [0, 0.55, 0], scale: [0.3, 1, 2.6] }} transition={{ delay: 0.5, duration: 0.55, times: [0, 0.2, 1] }} />}
              <motion.span className="plf-stamp" initial={{ opacity: 0, scale: 3, rotate: -18 }} animate={{ opacity: 1, scale: 1, rotate: -9 }} transition={reduce ? { duration: 0.01 } : { delay: 0.48, type: "spring", stiffness: 900, damping: 26 }}>
                <Lock aria-hidden /> Locked
              </motion.span>
            </motion.div>
            {reduce ? null : (
              <motion.span className="plf-stub" initial={{ x: 0, y: 0, rotate: 0, opacity: 1 }} animate={{ x: [0, 4, 46], y: [0, -3, 70], rotate: [0, 5, 28], opacity: [1, 1, 0] }} transition={{ delay: 0.68, duration: 0.45, times: [0, 0.2, 1], ease: "easeIn" }}>
                Stub
              </motion.span>
            )}
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body,
  )
}
