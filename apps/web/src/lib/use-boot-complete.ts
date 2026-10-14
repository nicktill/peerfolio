"use client"

import { useEffect, useState } from "react"

/** Wait for the logo handoff, including the already-seen session fast path. */
export function useBootComplete() {
  const [complete, setComplete] = useState(false)
  useEffect(() => {
    const root = document.documentElement
    const check = () => {
      if (root.getAttribute("data-boot") === "done" || !document.querySelector(".pf-boot")) {
        setComplete(true)
        observer.disconnect()
      }
    }
    const observer = new MutationObserver(check)
    observer.observe(root, { attributes: true, attributeFilter: ["data-boot"] })
    check()
    return () => observer.disconnect()
  }, [])
  return complete
}
