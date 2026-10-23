"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { X } from "lucide-react"
import { useInstall } from "@web/lib/install-prompt"

const DISMISSED = "pf-install-hint-dismissed"
const VISITS = "pf-visits"
const SEEN = "pf-install-hint-seen"
const QUIET_DAYS = 30
const MAX_SHOWS = 3
const SHOW_AFTER_MS = 6000
const SHOW_FOR_MS = 12000

/**
 * A tiny tooltip for phones, nothing more. It waits for a returning visit, pops up a few seconds in, fades away
 * on its own, and shows at most three times (or never again once dismissed). Desktop gets no prompt at all: the
 * browser has its own install button, and the sidebar has a quiet "Install app" row. On iPhone the tail points
 * down toward Safari's toolbar, where Share lives.
 */
export function InstallHint() {
  const { canPrompt, installed, ask } = useInstall()
  const [show, setShow] = useState(false)
  const [iphone, setIphone] = useState(false)

  useEffect(() => {
    let showTimer: number | undefined
    let hideTimer: number | undefined
    try {
      // `?installhint` previews the tooltip on any device, right away, ignoring every rule below.
      const force = new URLSearchParams(window.location.search).has("installhint")
      if (!force) {
        const phone = window.matchMedia("(pointer: coarse)").matches && window.matchMedia("(max-width: 860px)").matches
        if (!phone || installed) return
        const dismissedAt = Number(localStorage.getItem(DISMISSED) ?? 0)
        if (dismissedAt && Date.now() - dismissedAt < QUIET_DAYS * 864e5) return
        if (Number(localStorage.getItem(SEEN) ?? 0) >= MAX_SHOWS) return

        // One visit per browser session, so a first-time visitor isn't asked before they've seen the app.
        if (!sessionStorage.getItem(VISITS)) {
          sessionStorage.setItem(VISITS, "1")
          localStorage.setItem(VISITS, String(Number(localStorage.getItem(VISITS) ?? 0) + 1))
        }
        if (Number(localStorage.getItem(VISITS) ?? 0) < 2) return
      }

      setIphone(/iPhone|iPod/.test(navigator.userAgent))
      showTimer = window.setTimeout(() => {
        if (!force) localStorage.setItem(SEEN, String(Number(localStorage.getItem(SEEN) ?? 0) + 1))
        setShow(true)
        hideTimer = window.setTimeout(() => setShow(false), SHOW_FOR_MS)
      }, force ? 800 : SHOW_AFTER_MS)
    } catch {
      /* storage blocked: stay quiet */
    }
    return () => {
      window.clearTimeout(showTimer)
      window.clearTimeout(hideTimer)
    }
  }, [installed])

  if (!show) return null

  function dismiss() {
    try {
      localStorage.setItem(DISMISSED, String(Date.now()))
    } catch {
      /* ignore */
    }
    setShow(false)
  }

  return (
    <>
      <style>{"@keyframes pf-tip{0%{opacity:0;transform:translateY(6px)}6%,94%{opacity:1;transform:none}100%{opacity:0;transform:translateY(4px)}}@media (prefers-reduced-motion:reduce){.pf-tip{animation:none!important}}"}</style>
      <div
        role="note"
        className="pf-tip"
        // Tapping anywhere on the bubble (other than the link) dismisses it, so it's never in the way.
        onClick={(e) => { if (!(e.target as HTMLElement).closest("a,button[data-act]")) dismiss() }}
        style={{
          position: "fixed", left: 0, right: 0, margin: "0 auto", width: "max-content", maxWidth: "calc(100% - 32px)",
          bottom: "calc(66px + env(safe-area-inset-bottom))", zIndex: 45,
          display: "flex", alignItems: "center", gap: 8, padding: "7px 8px 7px 12px", borderRadius: 10,
          background: "var(--ink)", color: "var(--ink-fg)", fontSize: 12, lineHeight: "16px",
          animation: `pf-tip ${SHOW_FOR_MS}ms cubic-bezier(0.22, 1, 0.36, 1) forwards`,
        }}
      >
        <span>
          {canPrompt ? "Get the app" : iphone ? "Add to Home Screen for the app" : "Add this to your home screen"}
          {" · "}
          {canPrompt ? (
            <button type="button" data-act onClick={() => void ask().then(dismiss)} style={{ fontWeight: 600, textDecoration: "underline" }}>Install</button>
          ) : (
            <Link href="/install" style={{ fontWeight: 600, textDecoration: "underline" }}>See how</Link>
          )}
        </span>
        <button type="button" onClick={dismiss} aria-label="Dismiss" style={{ display: "grid", placeItems: "center", width: 36, height: 36, margin: "-10px -8px -10px -4px", opacity: 0.75 }}>
          <X aria-hidden className="h-3.5 w-3.5" />
        </button>
        {iphone ? (
          <span aria-hidden style={{ position: "absolute", left: "50%", bottom: -4, width: 9, height: 9, marginLeft: -4.5, background: "var(--ink)", transform: "rotate(45deg)", borderRadius: 1 }} />
        ) : null}
      </div>
    </>
  )
}
