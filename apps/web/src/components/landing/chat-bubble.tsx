"use client"

import { useEffect, useState } from "react"
import { revealStyle } from "@web/components/motion/reveal"
import { CastAvatar } from "@web/components/landing/cast-avatar"
import { CAST } from "@web/components/landing/demo"
import { cn } from "@web/lib/utils"

export type Line = { memberId: string; text: string }

/**
 * A group-chat message resting on a top corner of the league preview, its sender's avatar straddling the card
 * edge. It keeps the conversation going: a few dots, then the next message from someone else. The outer element
 * carries position, tilt and the entrance; the inner one the endless float, so the two never fight over a property.
 * With reduced motion it simply shows the first line.
 */
export function ChatBubble({ lines, side, className, delay = 0, every = 6200 }: { lines: Line[]; side: "left" | "right"; className?: string; delay?: number; every?: number }) {
  const [i, setI] = useState(0)
  const [typing, setTyping] = useState(false)

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    let t1: ReturnType<typeof setTimeout>, t2: ReturnType<typeof setTimeout>
    const loop = () => {
      t1 = setTimeout(() => {
        if (document.hidden) return loop()
        setTyping(true)
        t2 = setTimeout(() => {
          setI((n) => (n + 1) % lines.length)
          setTyping(false)
          loop()
        }, 1100)
      }, every)
    }
    const start = setTimeout(loop, delay * 1000)
    return () => {
      clearTimeout(start)
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [lines.length, every, delay])

  const line = lines[i]!
  const member = CAST.find((m) => m.id === line.memberId)!
  return (
    <div aria-hidden className={cn("reveal absolute z-10 hidden xl:block", className)} style={revealStyle(6 + Math.round(delay / 1.5))}>
      <div className="float-y relative" style={{ animationDelay: `${delay}s` }}>
        <div className="pf-bubble min-h-[62px]" style={{ minWidth: "15rem" }}>
          <p>{member.name}</p>
          {typing ? (
            <p className="pf-typing mt-1.5" aria-hidden>
              <i /><i /><i />
            </p>
          ) : (
            <p key={i} className="pf-msg mt-0.5 leading-snug" style={{ font: "inherit", textTransform: "none", letterSpacing: 0, color: "var(--fg)" }}>{line.text}</p>
          )}
        </div>
        <span className={cn("absolute -bottom-[18px] rounded-full p-[2px]", side === "left" ? "-left-9" : "-right-9")} style={{ background: "var(--bg)", boxShadow: `0 0 0 1.5px ${member.color}` }}>
          <CastAvatar member={member} size={30} />
        </span>
      </div>
    </div>
  )
}
