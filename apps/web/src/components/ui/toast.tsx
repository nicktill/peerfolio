"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react"
import { cn } from "@web/lib/utils"

type ToastTone = "success" | "error" | "info"
type Toast = { id: number; message: string; tone: ToastTone }

const ToastContext = createContext<{ toast: (message: string, tone?: ToastTone) => void } | null>(null)

/** Replaces `alert()` — non-blocking, dismissible, and announced politely. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const toast = useCallback((message: string, tone: ToastTone = "info") => {
    setToasts((prev) => [...prev, { id: Date.now() + Math.random(), message, tone }])
  }, [])

  const value = useMemo(() => ({ toast }), [toast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex flex-col items-center gap-2 p-4 safe-bottom sm:inset-x-auto sm:right-4 sm:items-end"
      >
        {toasts.map((t) => (
          <ToastCard key={t.id} toast={t} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

const TONES: Record<ToastTone, { icon: typeof Info; className: string }> = {
  success: { icon: CheckCircle2, className: "text-[--gain]" },
  error: { icon: AlertTriangle, className: "text-[--loss]" },
  info: { icon: Info, className: "text-muted-foreground" },
}

function ToastCard({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), 5000)
    return () => clearTimeout(timer)
  }, [toast.id, onDismiss])

  const { icon: Icon, className } = TONES[toast.tone]

  return (
    <div className="animate-rise-in pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border bg-card p-3.5 shadow-lg">
      <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", className)} aria-hidden />
      <p className="flex-1 text-sm leading-snug">{toast.message}</p>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
      >
        <X className="h-4 w-4" aria-hidden />
        <span className="sr-only">Dismiss</span>
      </button>
    </div>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error("useToast must be used within a ToastProvider")
  return ctx
}
