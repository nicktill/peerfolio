"use client"

import { useEffect, useState } from "react"
import { Share, X } from "lucide-react"

const KEY = "pf-install-hint-dismissed"

/**
 * iOS has no install prompt, so on iPhone Safari we point at Share → Add to Home Screen once.
 * Hidden once installed, once dismissed, and everywhere that isn't a phone browser.
 */
export function InstallHint() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    try {
      const ios = /iPhone|iPod/.test(navigator.userAgent)
      const installed = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone
      if (ios && !installed && !localStorage.getItem(KEY)) setShow(true)
    } catch {
      /* storage blocked: stay quiet */
    }
  }, [])

  if (!show) return null

  function dismiss() {
    try {
      localStorage.setItem(KEY, "1")
    } catch {
      /* ignore */
    }
    setShow(false)
  }

  return (
    <div
      role="note"
      className="peerfolio-install-hint"
      style={{
        position: "fixed", left: 12, right: 12, bottom: "calc(68px + env(safe-area-inset-bottom))", zIndex: 45,
        display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 12,
        background: "var(--panel)", border: "1px solid var(--line)", color: "var(--fg)", fontSize: 13, lineHeight: "18px",
        animation: "pf-enter 0.4s cubic-bezier(0.22, 1, 0.36, 1) 1.2s backwards",
      }}
    >
      <Share aria-hidden className="h-4 w-4 shrink-0" />
      <span style={{ flex: 1 }}>Install Peerfolio: tap Share, then Add to Home Screen.</span>
      <button type="button" onClick={dismiss} aria-label="Dismiss" style={{ color: "var(--fg3)", padding: 4 }}>
        <X aria-hidden className="h-4 w-4" />
      </button>
    </div>
  )
}
