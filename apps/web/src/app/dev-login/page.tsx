import { notFound } from "next/navigation"
import { DevLoginForm } from "./dev-login-form"

/**
 * Sign in as a seeded user without an OAuth app.
 *
 * A server component so the guard runs before anything renders: in a
 * production build, or without the opt-in flag, this route simply does not
 * exist. The provider in `lib/auth.ts` refuses independently, so neither lock
 * relies on the other.
 */
export default function DevLoginPage() {
  if (process.env.NODE_ENV === "production" || process.env.ENABLE_DEV_LOGIN !== "true") {
    notFound()
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <h1 className="text-2xl font-semibold tracking-tight">Developer login</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Local development only. Pick a seeded account, or enter any email that exists in your database.
      </p>
      <DevLoginForm />
    </main>
  )
}
