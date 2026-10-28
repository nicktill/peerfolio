"use client"

import { useEffect } from "react"
import { SOURCE_COOKIE, SOURCE_COOKIE_MAX_AGE, buildSourceCookie } from "@web/lib/signup-source"

/** Sets the first-visit cookie once; later visits within the week leave it alone. */
export function SourceCapture() {
  useEffect(() => {
    try {
      if (document.cookie.split("; ").some((c) => c.startsWith(`${SOURCE_COOKIE}=`))) return
      const value = buildSourceCookie(location.href, document.referrer, location.hostname)
      if (value) document.cookie = `${SOURCE_COOKIE}=${value}; Max-Age=${SOURCE_COOKIE_MAX_AGE}; Path=/; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`
    } catch {
      /* cookies blocked: nothing to record */
    }
  }, [])
  return null
}
