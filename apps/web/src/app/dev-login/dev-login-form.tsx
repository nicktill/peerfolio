"use client"

import { useState } from "react"
import { signIn } from "next-auth/react"
import { Button } from "@web/components/ui/button"

/** Matches the handles created by `npm run db:seed`. */
const SEEDED = ["nick", "maya", "deshawn", "priya", "sam"]

export function DevLoginForm() {
  const [email, setEmail] = useState("nick@example.com")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)

    const result = await signIn("dev-login", { email, redirect: false })

    if (result?.error) {
      setError("No user with that email. Run `npm run db:seed` first.")
      setPending(false)
      return
    }

    window.location.href = "/dashboard"
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {SEEDED.map((handle) => (
          <button
            key={handle}
            type="button"
            onClick={() => setEmail(`${handle}@example.com`)}
            className="rounded-full border px-3 py-1 text-xs font-medium transition-colors hover:bg-secondary"
          >
            {handle}
          </button>
        ))}
      </div>

      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
        aria-label="Email"
      />

      {error ? (
        <p role="alert" className="text-sm text-loss-ink">
          {error}
        </p>
      ) : null}

      <Button type="submit" loading={pending} className="w-full">
        Sign in
      </Button>
    </form>
  )
}
