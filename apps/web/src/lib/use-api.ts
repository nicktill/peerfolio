"use client"

import { useCallback, useEffect, useRef, useState } from "react"

type State<T> = { data: T | null; error: string | null; loading: boolean }

/**
 * Minimal GET hook: load, expose errors, allow refetch.
 *
 * Stale responses are dropped by request id so a fast range switch can't be
 * overwritten by a slower earlier request landing late.
 *
 * A failed refresh keeps the last good data (with `error` set) rather than
 * blanking a page someone is looking at. With `refreshMs`, the data reloads on
 * that interval and when the tab regains focus, and stays quiet while hidden.
 */
export function useApi<T>(url: string | null, deps: unknown[] = [], { refreshMs }: { refreshMs?: number } = {}) {
  const [state, setState] = useState<State<T>>({ data: null, error: null, loading: !!url })
  const requestId = useRef(0)
  const lastLoaded = useRef(0)

  const load = useCallback(async () => {
    if (!url) {
      setState({ data: null, error: null, loading: false })
      return
    }

    const id = ++requestId.current
    setState((prev) => ({ ...prev, loading: true, error: null }))

    try {
      const response = await fetch(url)
      const body = await response.json()
      if (id !== requestId.current) return

      if (!response.ok) {
        setState((prev) => ({ data: prev.data, error: body?.error ?? "Request failed", loading: false }))
        return
      }
      lastLoaded.current = Date.now()
      setState({ data: body as T, error: null, loading: false })
    } catch {
      if (id !== requestId.current) return
      setState((prev) => ({ data: prev.data, error: "Network error", loading: false }))
    }
  }, [url])

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, ...deps])

  useEffect(() => {
    if (!url || !refreshMs) return
    const tick = () => {
      if (document.visibilityState === "visible") void load()
    }
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - lastLoaded.current >= refreshMs) void load()
    }
    const timer = setInterval(tick, refreshMs)
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      clearInterval(timer)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [url, refreshMs, load])

  return { ...state, refetch: load }
}

/** POST/PATCH/DELETE helper that surfaces the API's error message. */
export async function mutate<T = unknown>(
  url: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const response = await fetch(url, {
    method: options.method ?? "POST",
    headers: options.body ? { "Content-Type": "application/json" } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data?.error ?? "Request failed")

  return data as T
}
