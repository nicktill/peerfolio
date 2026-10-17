"use client"

import { useEffect, useRef } from "react"

/**
 * What a page is showing right now that the assistant should know about ("the 3M range, S&P 500 overlaid, the
 * Roth IRA expanded"). Several parts of a page can publish at once; each owns its own keys. The assistant reads
 * the merged view when a question is sent, so nothing re-renders and a page that publishes nothing costs nothing.
 * The server keeps only whitelisted or bounded values from it.
 */
export type PublishedView = { range?: string; benchmark?: string; account?: string; holding?: string }

const parts = new Map<symbol, PublishedView>()

export function readAssistantView(): PublishedView {
  const merged: PublishedView = {}
  for (const part of parts.values()) {
    for (const [k, v] of Object.entries(part)) if (v) (merged as Record<string, string>)[k] = v
  }
  return merged
}

export function useAssistantView(view: PublishedView) {
  const owner = useRef<symbol>(Symbol("assistant-view"))
  const { range, benchmark, account, holding } = view
  useEffect(() => {
    const id = owner.current
    parts.set(id, { range, benchmark, account, holding })
    return () => {
      parts.delete(id)
    }
  }, [range, benchmark, account, holding])
}
