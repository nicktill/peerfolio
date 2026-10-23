"use client"

import { useSyncExternalStore } from "react"

type Deferred = Event & { prompt: () => Promise<unknown> }

// Chrome fires `beforeinstallprompt` once per page load, early. Keep it here so any component, mounted any time
// later (the sidebar, the settings page), can use it. Safari and Firefox never fire it; callers fall back to /install.
let deferred: Deferred | null = null
const listeners = new Set<() => void>()
let attached = false

function emit() {
  listeners.forEach((l) => l())
}

function attach() {
  if (attached || typeof window === "undefined") return
  attached = true
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault()
    deferred = e as Deferred
    emit()
  })
  window.addEventListener("appinstalled", () => {
    deferred = null
    emit()
  })
}

function subscribe(listener: () => void) {
  attach()
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

const isInstalled = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true

export function useInstall() {
  const prompt = useSyncExternalStore(subscribe, () => deferred, () => null)
  const installed = useSyncExternalStore(() => () => {}, isInstalled, () => false)
  async function ask() {
    const d = deferred
    if (!d) return
    deferred = null // the browser allows one prompt per event
    emit()
    await d.prompt().catch(() => {})
  }
  return { canPrompt: !!prompt, installed, ask }
}
