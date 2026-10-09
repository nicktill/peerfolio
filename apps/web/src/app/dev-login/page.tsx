import { notFound } from "next/navigation"
import { devLoginMode } from "@web/lib/dev-login"
import { DevLoginForm } from "./dev-login-form"

/**
 * Sign in as an existing user without an OAuth app.
 *
 * A server component so the guard runs before anything renders: where the login is off (production,
 * or without the opt-in flag) this route simply does not exist. The provider in `lib/auth.ts` checks
 * independently, so neither lock relies on the other.
 */
export default function DevLoginPage() {
  const mode = devLoginMode()
  if (mode === "off") notFound()

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <h1 className="text-2xl font-semibold tracking-tight">Developer login</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {mode === "preview"
          ? "Preview deployments only. Enter the passcode and one of the allowed accounts."
          : "Local development only. Pick a seeded account, or enter any email that exists in your database."}
      </p>
      <DevLoginForm requirePasscode={mode === "preview"} />
    </main>
  )
}
