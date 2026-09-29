"use client"

import { useEffect, useState } from "react"

/**
 * Types out each word in turn, after a fixed `prefix` that stays put ("with "),
 * so the whole line reads as one green unit. The first word is in the server
 * markup, so the headline is complete on first paint and never flashes empty.
 */
export function RotatingWord({ words, prefix = "" }: { words: readonly string[]; prefix?: string }) {
  const [index, setIndex] = useState(0)
  const [text, setText] = useState(words[0]!)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const word = words[index]!
    let delay = deleting ? 45 : 85
    if (!deleting && text === word) delay = 1800
    const timer = setTimeout(() => {
      if (!deleting && text === word) setDeleting(true)
      else if (deleting && text === "") {
        setDeleting(false)
        setIndex((i) => (i + 1) % words.length)
      } else setText(deleting ? word.slice(0, text.length - 1) : word.slice(0, text.length + 1))
    }, delay)
    return () => clearTimeout(timer)
  }, [text, deleting, index, words])

  return (
    <span className="whitespace-nowrap text-primary">
      <span className="sr-only">{prefix}{words[0]}</span>
      <span aria-hidden>
        {prefix}{text}
        <span className="caret ml-0.5 inline-block w-[3px] translate-y-[0.08em] self-stretch bg-primary/70" style={{ height: "0.9em" }} />
      </span>
    </span>
  )
}
