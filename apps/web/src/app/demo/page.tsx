import { notFound, redirect } from "next/navigation"
import { DEMO_EMAILS, devLoginMode, passcodeRequired } from "@web/lib/dev-login"
import { DemoSignIn } from "./demo-sign-in"

// Reads runtime env, so never prerender.
export const dynamic = "force-dynamic"

/** One-click entry to the demo account, wherever the developer login is on. 404 everywhere else. */
export default function DemoPage() {
  const mode = devLoginMode()
  if (mode === "off") notFound()
  // A passcode means a person must type it, so hand over to the regular form.
  if (mode === "preview" && passcodeRequired()) redirect("/dev-login")
  return <DemoSignIn email={DEMO_EMAILS[0]!} />
}
