/**
 * The local "demo data" switch: Real (default), Empty (every list answers with nothing, to see the empty
 * states) or Sample (lists answer with the sample fixtures). It lives in this browser only, set from the pill
 * in the app shell or a `?demo=empty|sample|real` link, and nothing is written anywhere else.
 */
export type DemoMode = "real" | "empty" | "sample"

const KEY = "pf-demo"
const isMode = (v: unknown): v is DemoMode => v === "real" || v === "empty" || v === "sample"

export function getDemoMode(): DemoMode {
  if (typeof window === "undefined") return "real"
  try {
    const fromUrl = new URLSearchParams(window.location.search).get("demo")
    if (isMode(fromUrl)) {
      if (fromUrl === "real") localStorage.removeItem(KEY)
      else localStorage.setItem(KEY, fromUrl)
      return fromUrl
    }
    const stored = localStorage.getItem(KEY)
    return isMode(stored) ? stored : "real"
  } catch {
    return "real"
  }
}

/** Switches mode and reloads, so every screen and cache starts clean. */
export function setDemoMode(mode: DemoMode) {
  try {
    if (mode === "real") localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, mode)
  } catch {}
  const url = new URL(window.location.href)
  url.searchParams.delete("demo")
  window.location.assign(url.toString())
}
