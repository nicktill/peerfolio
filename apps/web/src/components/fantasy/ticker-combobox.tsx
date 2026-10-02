"use client"

import { useEffect, useId, useRef, useState } from "react"
import { rankSuggestions, type TickerSuggestion } from "@web/lib/ticker-search"
import { cn } from "@web/lib/utils"

type Suggestion = TickerSuggestion & { detail?: string }

/** Answers per query for this page load, so backspacing and retyping is instant. */
const cache = new Map<string, Suggestion[]>()

/**
 * The ticker field with a dropdown of matching stocks, by symbol or company
 * name. Arrow keys and Enter pick one; so does a tap. With `local` set it
 * suggests only from that list (selling only offers what you hold) and never
 * asks the server. Anything typed still works: an unknown symbol just shows no
 * suggestions, and the quote preview below the field says what's wrong.
 */
export function TickerCombobox({
  value,
  onChange,
  local,
  className,
}: {
  value: string
  onChange: (symbol: string) => void
  local?: Suggestion[]
  className?: string
}) {
  const listId = useId()
  const [focused, setFocused] = useState(false)
  const [remote, setRemote] = useState<{ query: string; results: Suggestion[] }>({ query: "", results: [] })
  const [active, setActive] = useState(-1)
  // The symbol just picked from the list; the list stays shut until the text changes again.
  const [picked, setPicked] = useState<string | null>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const query = value.trim()
  const localOnly = !!local

  useEffect(() => {
    if (localOnly || !query) return
    const cached = cache.get(query)
    if (cached) {
      setRemote({ query, results: cached })
      return
    }
    let cancelled = false
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/market/search?q=${encodeURIComponent(query)}`)
        if (!response.ok) return
        const body = (await response.json()) as { results?: Suggestion[] }
        const results = body.results ?? []
        cache.set(query, results)
        if (!cancelled) setRemote({ query, results })
      } catch {
        // No suggestions this time; typing the ticker still works.
      }
    }, 150)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query, localOnly])

  const suggestions: Suggestion[] = !query
    ? []
    : local
      ? rankSuggestions(query, [local], 6).map((s) => local.find((l) => l.symbol === s.symbol) ?? s)
      : remote.query === query
        ? remote.results
        : []
  // One suggestion that is exactly what's typed adds nothing; the preview already names it.
  const redundant = suggestions.length === 1 && suggestions[0].symbol === query.toUpperCase()
  const open = focused && picked !== value && suggestions.length > 0 && !redundant

  useEffect(() => setActive(-1), [query, open])

  useEffect(() => {
    if (active < 0) return
    listRef.current?.children[active]?.scrollIntoView({ block: "nearest" })
  }, [active])

  function pick(symbol: string) {
    setPicked(symbol)
    onChange(symbol)
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!open) return
    if (event.key === "ArrowDown") {
      event.preventDefault()
      setActive((i) => (i + 1) % suggestions.length)
    } else if (event.key === "ArrowUp") {
      event.preventDefault()
      setActive((i) => (i <= 0 ? suggestions.length - 1 : i - 1))
    } else if (event.key === "Enter" && active >= 0) {
      // Picking from the list shouldn't also submit the trade.
      event.preventDefault()
      pick(suggestions[active].symbol)
    } else if (event.key === "Escape") {
      event.preventDefault()
      setPicked(value)
    }
  }

  return (
    <div className="relative">
      <input
        aria-label="Ticker"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
        autoCapitalize="characters"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="next"
        value={value}
        onChange={(e) => {
          setPicked(null)
          onChange(e.target.value.toUpperCase().replace(/[^A-Z0-9.\-/]/g, "").slice(0, 12))
        }}
        onKeyDown={onKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder="Ticker or company, e.g. NVDA"
        className={className}
      />
      {open ? (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label="Matching tickers"
          className="absolute inset-x-0 top-full z-30 mt-1 max-h-72 overflow-y-auto overscroll-contain rounded-xl border bg-popover p-1 text-popover-foreground shadow-lg"
        >
          {suggestions.map((s, i) => (
            <li
              key={s.symbol}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              // Keeps focus in the field, so the blur doesn't close the list before the tap lands.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(s.symbol)}
              onMouseMove={() => setActive(i)}
              className={cn("flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2.5 py-1.5", i === active && "bg-secondary")}
            >
              <span className="w-16 shrink-0 font-mono text-sm font-semibold">{s.symbol}</span>
              <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{s.detail ?? s.name ?? ""}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
