"use client"
import { useEffect, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { ThemeToggle } from "@web/components/theme-toggle"
import { SignInButton } from "@web/components/landing/sign-in-button"
import { cn } from "@web/lib/utils"

export function LandingHeader() {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 8)
    update()
    window.addEventListener("scroll", update, { passive: true })
    return () => window.removeEventListener("scroll", update)
  }, [])
  return (
    <header className={cn("sticky top-0 z-40 -mb-14 border-b transition-colors", scrolled ? "border-border/60 bg-background/85 backdrop-blur-md" : "border-transparent bg-transparent")}>
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2" aria-label="Peerfolio home">
          <span className="grid size-7 place-items-center rounded-lg bg-white shadow-sm ring-1 ring-border">
            <Image src="/logo.png" alt="" width={20} height={20} priority />
          </span>
          <span className="text-[15px] font-semibold tracking-tight">Peerfolio</span>
        </Link>
        <div className="flex items-center gap-2"><ThemeToggle /><SignInButton compact /></div>
      </div>
    </header>
  )
}
