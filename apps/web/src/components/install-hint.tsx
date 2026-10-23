"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Share, X } from "lucide-react"

const DISMISSED = "pf-install-hint-dismissed"
const VISITS = "pf-visits"
const QUIET_DAYS = 30
const SHOW_AFTER_MS = 8000

type InstallPrompt = Event & { prompt: () => Promise<void> }

/**
 * A quiet nudge to install, for phones only. Desktop browsers already offer their own install button in the
 * address bar, so nothing here runs there. It waits for a returning visit, appears a few seconds in, never covers
 * the page, and stays away for a month once dismissed. iPhone has no install prompt, so it points at the Share
 * menu; Android Chrome hands us its native prompt, which one tap on "Install" opens.
 */
export function InstallHint() {
  const [show, setShow] = useState(false)
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null)

  useEffect(() => {
    let timer: number | undefined
    let off = () => {}
    try {
      const phone = window.matchMedia("(pointer: coarse)").matches && window.matchMedia("(max-width: 860px)").matches
      const installed = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone
      if (!phone || installed) return

      const dismissedAt = Number(localStorage.getItem(DISMISSED) ?? 0)
      if (dismissedAt && Date.now() - dismissedAt < QUIET_DAYS * 864e5) return

      // Count visits (one per browser session) so a first-time visitor isn't asked before they've seen the app.
      if (!sessionStorage.getItem(VISITS)) {
        sessionStorage.setItem(VISITS, "1")
        localStorage.setItem(VISITS, String(Number(localStorage.getItem(VISITS) ?? 0) + 1))
      }
      if (Number(localStorage.getItem(VISITS) ?? 0) < 2) return

      const reveal = () => {
        timer = window.setTimeout(() => setShow(true), SHOW_AFTER_MS)
      }
      if (/iPhone|iPod/.test(navigator.userAgent)) reveal()
      const onPrompt = (e: Event) => {
        e.preventDefault()
        setPrompt(e as InstallPrompt)
        reveal()
      }
      window.addEventListener("beforeinstallprompt", onPrompt)
      off = () => window.removeEventListener("beforeinstallprompt", onPrompt)
    } catch {
      /* storage blocked: stay quiet */
    }
    return () => {
      off()
      window.clearTimeout(timer)
    }
  }, [])

  if (!show) return null

  function dismiss() {
    try {
      localStorage.setItem(DISMISSED, String(Date.now()))
    } catch {
      /* ignore */
    }
    setShow(false)
  }

  async function install() {
    if (!prompt) return
    await prompt.prompt().catch(() => {})
    dismiss()
  }

  return (
    <div
      role="note"
      className="peerfolio-install-hint"
      style={{
        position: "fixed", left: 0, right: 0, margin: "0 auto", width: "min(calc(100% - 32px), 340px)",
        bottom: "calc(68px + env(safe-area-inset-bottom))", zIndex: 45,
        display: "flex", alignItems: "center", gap: 10, padding: "9px 10px 9px 12px", borderRadius: 999,
        background: "var(--panel)", border: "1px solid var(--hair)", color: "var(--fg2)", fontSize: 12.5, lineHeight: "17px",
        animation: "pf-enter 0.5s cubic-bezier(0.22, 1, 0.36, 1) backwards",
      }}
    >
      <Share aria-hidden className="h-3.5 w-3.5 shrink-0" />
      <span style={{ flex: 1 }}>
        {prompt ? "Add Peerfolio to your home screen" : "Tap Share, then Add to Home Screen"}{" "}
        {prompt ? (
          <button type="button" onClick={install} style={{ color: "var(--fg)", textDecoration: "underline", fontWeight: 500 }}>Install</button>
        ) : (
          <Link href="/install" style={{ color: "var(--fg)", textDecoration: "underline" }}>See how</Link>
        )}
      </span>
      <button type="button" onClick={dismiss} aria-label="Dismiss" style={{ display: "grid", placeItems: "center", width: 24, height: 24, color: "var(--fg3)" }}>
        <X aria-hidden className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
