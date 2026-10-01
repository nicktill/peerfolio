import { notFound } from "next/navigation"
import { devLoginAllowed } from "@web/lib/dev-login"
import { DevLoginForm } from "./dev-login-form"

// Decided per request, not frozen at build: the build step can't see every
// environment variable, and this guard must reflect the deployment it runs in.
export const dynamic = "force-dynamic"

/**
 * Sign in as a seeded user without an OAuth app.
 *
 * A server component so the guard runs before anything renders: in a
 * production deployment, or without the opt-in flag, this route simply does
 * not exist (see lib/dev-login.ts). The provider in `lib/auth.ts` refuses independently, so neither lock
 * relies on the other.
 */
export default function DevLoginPage() {
  if (!devLoginAllowed()) {
    notFound()
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <h1 className="text-2xl font-semibold tracking-tight">Developer login</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Local development and protected preview builds only. Pick a seeded demo account, or enter any email that exists in this database.
      </p>
      <DevLoginForm />
    </main>
  )
}
