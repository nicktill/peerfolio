"use client"

import { useState } from "react"
import { signIn } from "next-auth/react"
import { Button } from "@web/components/ui/button"

/** Matches the handles created by `npm run db:seed`. */
const SEEDED = ["nick", "maya", "deshawn", "priya", "sam"]

export function DevLoginForm({ requirePasscode = false, preview = false, emails }: { requirePasscode?: boolean; preview?: boolean; emails?: string[] }) {
  const [email, setEmail] = useState(requirePasscode ? "" : "nick@example.com")
  // A preview with no passcode is one click on a demo person; there is nothing to type.
  const oneClick = preview && !requirePasscode
  const [passcode, setPasscode] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function enter(as: string) {
    setPending(true)
    setError(null)

    const result = await signIn("dev-login", { email: as, passcode, redirect: false })

    if (result?.error) {
      // NextAuth reports a plain refusal as "CredentialsSignin"; anything else is a message worth showing.
      const detail = result.error !== "CredentialsSignin" ? result.error : null
      setError(detail ?? (requirePasscode ? "That passcode or account isn't allowed." : "No user with that email. Run `npm run db:seed` first."))
      setPending(false)
      return
    }

    window.location.href = "/dashboard"
  }

  function submit(event: React.FormEvent) {
    event.preventDefault()
    void enter(email)
  }

  if (oneClick) {
    return (
      <div className="mt-6 space-y-3">
        <div className="grid gap-2">
          {(emails ?? []).map((address) => (
            <Button key={address} type="button" variant="outline" disabled={pending} onClick={() => void enter(address)} className="justify-between">
              <span className="capitalize">{address.split("@")[0]}</span>
              <span className="text-xs font-normal text-muted-foreground">{address}</span>
            </Button>
          ))}
        </div>
        {error ? (
          <p role="alert" className="text-sm text-loss-ink">
            {error}
          </p>
        ) : null}
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-4">
      <div className={requirePasscode ? "hidden" : "flex flex-wrap gap-1.5"}>
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

      {requirePasscode ? (
        <input
          type="password"
          value={passcode}
          onChange={(e) => setPasscode(e.target.value)}
          autoComplete="off"
          className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
          aria-label="Passcode"
          placeholder="Passcode"
        />
      ) : null}

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
