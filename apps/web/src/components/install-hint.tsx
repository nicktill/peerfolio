"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Share, X } from "lucide-react"

const KEY = "pf-install-hint-dismissed"

type InstallPrompt = Event & { prompt: () => Promise<void> }

/**
 * iOS has no install prompt, so on iPhone Safari we point at Share → Add to Home Screen once. Android Chrome does:
 * it hands us the native prompt, which one tap on "Install" opens. Hidden once installed, once dismissed, and
 * everywhere that isn't a phone browser.
 */
export function InstallHint() {
  const [show, setShow] = useState(false)
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null)

  useEffect(() => {
    let off = () => {}
    try {
      const ios = /iPhone|iPod/.test(navigator.userAgent)
      const installed = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone
      if (installed || localStorage.getItem(KEY)) return
      if (ios) setShow(true)
      const onPrompt = (e: Event) => {
        e.preventDefault()
        setPrompt(e as InstallPrompt)
        setShow(true)
      }
      window.addEventListener("beforeinstallprompt", onPrompt)
      off = () => window.removeEventListener("beforeinstallprompt", onPrompt)
    } catch {
      /* storage blocked: stay quiet */
    }
    return off
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
        position: "fixed", left: 12, right: 12, bottom: "calc(68px + env(safe-area-inset-bottom))", zIndex: 45,
        display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 12,
        background: "var(--panel)", border: "1px solid var(--line)", color: "var(--fg)", fontSize: 13, lineHeight: "18px",
        animation: "pf-enter 0.4s cubic-bezier(0.22, 1, 0.36, 1) 1.2s backwards",
      }}
    >
      <Share aria-hidden className="h-4 w-4 shrink-0" />
      <span style={{ flex: 1 }}>
        {prompt ? "Install Peerfolio on your home screen." : "Install Peerfolio: tap Share, then Add to Home Screen."}{" "}
        {prompt ? (
          <button type="button" onClick={install} style={{ textDecoration: "underline", fontWeight: 500 }}>Install</button>
        ) : (
          <Link href="/install" style={{ textDecoration: "underline" }}>See how</Link>
        )}
      </span>
      <button type="button" onClick={dismiss} aria-label="Dismiss" style={{ color: "var(--fg3)", padding: 4 }}>
        <X aria-hidden className="h-4 w-4" />
      </button>
    </div>
  )
}
