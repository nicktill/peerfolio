import Link from "next/link"

/** Where privacy requests and general questions go. Must be a monitored inbox. */
export const CONTACT_EMAIL = "privacy@peerfolio.org"

export function SiteFooter() {
  return (
    <footer className="border-t">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <span>© {new Date().getFullYear()} Peerfolio</span>
        <nav className="-mx-2 flex gap-2 sm:mx-0 sm:gap-4">
          <Link href="/privacy" className="inline-flex min-h-10 items-center px-2 transition-colors hover:text-foreground">
            Privacy
          </Link>
          <Link href="/terms" className="inline-flex min-h-10 items-center px-2 transition-colors hover:text-foreground">
            Terms
          </Link>
          <a href={`mailto:${CONTACT_EMAIL}`} className="inline-flex min-h-10 items-center px-2 transition-colors hover:text-foreground">
            Contact
          </a>
        </nav>
      </div>
    </footer>
  )
}
