"use client"

import { useState } from "react"
import { signIn, useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { Button } from "@web/components/ui/button"
import { mutate } from "@web/lib/use-api"

export function JoinFantasy({ code, leagueName }: { code: string; leagueName: string }) {
  const { status } = useSession()
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function join() {
    setPending(true)
    setError(null)
    try {
      const result = await mutate<{ league: { id: string } }>("/api/fantasy/join", { body: { code } })
      router.push(`/fantasy/${result.league.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't join that league.")
      setPending(false)
    }
  }

  if (status === "loading") {
    return <div className="skeleton mt-8 h-10 w-full rounded-lg" />
  }

  // Signing in returns here rather than to the dashboard, so the invite
  // survives the round trip instead of stranding them on a page they didn't ask for.
  if (status === "unauthenticated") {
    return (
      <div className="mt-8">
        <Button className="w-full" onClick={() => signIn("google", { callbackUrl: `/fantasy/join/${code}` })}>
          Sign in to join
        </Button>
        <p className="mt-3 text-center text-xs text-muted-foreground">
          You&apos;ll come straight back to {leagueName}.
        </p>
      </div>
    )
  }

  return (
    <div className="mt-8">
      <Button className="w-full" onClick={() => void join()} loading={pending}>
        Join {leagueName} 🏈
      </Button>
      {error ? (
        <p role="alert" className="mt-3 text-sm text-loss-ink">
          {error}
        </p>
      ) : null}
    </div>
  )
}
