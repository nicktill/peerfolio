import Image from "next/image"
import Link from "next/link"
import { ThemeToggle } from "@web/components/theme-toggle"
import { SignInButton } from "@web/components/landing/sign-in-button"

export function LandingHeader() {
  return (
    <header className="pf-header">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 sm:px-5">
        <Link href="/" className="flex items-center gap-2.5" aria-label="Peerfolio home">
          <Image src="/logo.png" alt="" width={26} height={26} priority data-brand-logo className="pf-logo" />
          <span className="pf-wordmark">Peerfolio</span>
        </Link>
        <div className="flex items-center gap-2"><ThemeToggle /><SignInButton compact /></div>
      </div>
    </header>
  )
}
