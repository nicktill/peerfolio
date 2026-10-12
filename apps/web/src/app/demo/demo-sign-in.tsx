"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { getSession, signIn } from "next-auth/react"
import { Button } from "@web/components/ui/button"

export function DemoSignIn({ email }: { email: string }) {
  const [error, setError] = useState<string | null>(null)
  const started = useRef(false)

  const enter = useCallback(async () => {
    setError(null)
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await signIn("dev-login", { email, passcode: "", redirect: false })
      if (result?.error) {
        setError(result.error !== "CredentialsSignin" ? result.error : "The demo account isn't available right now.")
        return
      }
      if ((await getSession())?.user) {
        window.location.href = "/dashboard"
        return
      }
    }
    setError("Signed in, but the session didn't stick. Try again.")
  }, [email])

  useEffect(() => {
    if (started.current) return
    started.current = true
    void enter()
  }, [enter])

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <h1 className="text-2xl font-semibold tracking-tight">{error ? "Couldn't open the demo" : "Setting up your demo…"}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {error ?? "The first visit builds the sample data, so it can take a few seconds. Everything here is fictional."}
      </p>
      {error ? (
        <div className="mt-6 flex items-center gap-4">
          <Button type="button" onClick={() => void enter()}>Try again</Button>
          <Link href="/dev-login" className="text-sm underline">Pick a person instead</Link>
        </div>
      ) : null}
    </main>
  )
}
