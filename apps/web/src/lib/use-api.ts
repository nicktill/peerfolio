"use client"

import { useCallback, useEffect, useRef, useState } from "react"

type State<T> = { data: T | null; error: string | null; loading: boolean }

/**
 * Minimal GET hook: load, expose errors, allow refetch.
 *
 * Stale responses are dropped by request id so a fast range switch can't be
 * overwritten by a slower earlier request landing late.
 */
export function useApi<T>(url: string | null, deps: unknown[] = []) {
  const [state, setState] = useState<State<T>>({ data: null, error: null, loading: !!url })
  const requestId = useRef(0)

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
        setState({ data: null, error: body?.error ?? "Request failed", loading: false })
        return
      }
      setState({ data: body as T, error: null, loading: false })
    } catch {
      if (id !== requestId.current) return
      setState({ data: null, error: "Network error", loading: false })
    }
  }, [url])

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, ...deps])

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
