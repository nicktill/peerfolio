"use client"

import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { signOut, useSession } from "next-auth/react"
import { Gamepad2, LayoutDashboard, LogOut, Newspaper, Settings, Trophy, Users } from "lucide-react"
import { cn } from "@web/lib/utils"
import { cacheClear } from "@web/lib/api-cache"
import { slideStyle, useSlidingIndicator } from "@web/lib/use-sliding-indicator"
import { Avatar } from "@web/components/ui/avatar"
import { Button } from "@web/components/ui/button"
import { Skeleton } from "@web/components/ui/skeleton"

import { ThemeToggle } from "@web/components/theme-toggle"

const LINKS = [
  { href: "/dashboard", label: "Portfolio", icon: LayoutDashboard },
  { href: "/leagues", label: "Leagues", icon: Users },
  { href: "/fantasy", label: "Fantasy", icon: Gamepad2 },
  { href: "/board", label: "Board", icon: Trophy },
  { href: "/news", label: "News", icon: Newspaper },
]

export function AppNav() {
  const pathname = usePathname()
  const { data: session, status } = useSession()
  const activeHref = LINKS.find((l) => pathname.startsWith(l.href))?.href ?? null

  const desktop = useSlidingIndicator<HTMLElement>(activeHref)
  const mobile = useSlidingIndicator<HTMLDivElement>(activeHref)

  return (
    <>
      <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
          <Link href="/dashboard" className="press flex shrink-0 items-center gap-2">
            <span className="grid size-7 place-items-center rounded-lg bg-white shadow-sm ring-1 ring-border">
              <Image src="/logo.png" alt="" width={20} height={20} />
            </span>
            <span className="text-[15px] font-semibold tracking-tight">Peerfolio</span>
          </Link>

          <nav ref={desktop.containerRef} className="relative ml-4 hidden items-center gap-1 sm:flex">
            {/* One pill that glides to whichever page you're on. */}
            <span aria-hidden className="absolute inset-y-0 left-0 rounded-lg bg-secondary" style={slideStyle(desktop.rect, desktop.ready)} />
            {LINKS.map((link) => (
              <NavLink key={link.href} {...link} active={activeHref === link.href} />
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-1.5">
            <ThemeToggle />
            <Link
              href="/settings"
              className={cn(
                "press inline-flex h-9 w-9 items-center justify-center rounded-lg transition-colors hover:bg-secondary",
                pathname === "/settings" && "bg-secondary",
              )}
            >
              <Settings className="h-4 w-4" aria-hidden />
              <span className="sr-only">Settings</span>
            </Link>
            {/* A placeholder circle until the session confirms, so it doesn't flash "?" first. */}
            {status === "loading" ? (
              <Skeleton className="ml-0.5 h-7 w-7 rounded-full" />
            ) : (
              <Avatar src={session?.user?.image} name={session?.user?.name} size="sm" className="ml-0.5" />
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                // Cached responses belong to this user.
                cacheClear()
                void signOut({ callbackUrl: "/" })
              }}
              className="hidden sm:inline-flex"
            >
              <LogOut className="h-4 w-4" aria-hidden />
              <span className="sr-only">Sign out</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Thumb-reachable tab bar; the header nav hides below sm. */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur safe-bottom sm:hidden">
        <div ref={mobile.containerRef} className="relative flex items-stretch">
          <span aria-hidden className="absolute left-0 top-0 h-0.5 rounded-full bg-primary" style={slideStyle(mobile.rect, mobile.ready)} />
          {LINKS.map((link) => {
            const active = activeHref === link.href
            return (
              <Link
                key={link.href}
                href={link.href}
                data-slide-key={link.href}
                className={cn(
                  "press flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors",
                  active ? "text-primary" : "text-muted-foreground",
                )}
                aria-current={active ? "page" : undefined}
              >
                <link.icon className="h-5 w-5" aria-hidden />
                {link.label}
              </Link>
            )
          })}
        </div>
      </nav>
    </>
  )
}

function NavLink({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string
  label: string
  icon: typeof Users
  active: boolean
}) {
  return (
    <Link
      href={href}
      data-slide-key={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "press relative z-10 inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors",
        active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="h-4 w-4" aria-hidden />
      {label}
    </Link>
  )
}
