"use client"

import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { signOut, useSession } from "next-auth/react"
import { Gamepad2, LayoutDashboard, LogOut, Settings, Trophy, Users } from "lucide-react"
import { cn } from "@web/lib/utils"
import { Avatar } from "@web/components/ui/avatar"
import { Button } from "@web/components/ui/button"

import { ThemeToggle } from "@web/components/theme-toggle"

const LINKS = [
  { href: "/dashboard", label: "Portfolio", icon: LayoutDashboard },
  { href: "/leagues", label: "Leagues", icon: Users },
  { href: "/fantasy", label: "Fantasy", icon: Gamepad2 },
  { href: "/board", label: "Board", icon: Trophy },
]

export function AppNav() {
  const pathname = usePathname()
  const { data: session } = useSession()

  return (
    <>
      <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
          <Link href="/dashboard" className="flex shrink-0 items-center gap-2">
            <span className="grid size-7 place-items-center rounded-lg bg-white shadow-sm ring-1 ring-border">
              <Image src="/logo.png" alt="" width={20} height={20} />
            </span>
            <span className="text-[15px] font-semibold tracking-tight">Peerfolio</span>
          </Link>

          <nav className="ml-4 hidden items-center gap-1 sm:flex">
            {LINKS.map((link) => (
              <NavLink key={link.href} {...link} active={pathname.startsWith(link.href)} />
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-1.5">
            <ThemeToggle />
            <Link
              href="/settings"
              className={cn(
                "inline-flex h-9 w-9 items-center justify-center rounded-lg transition-colors hover:bg-secondary",
                pathname === "/settings" && "bg-secondary",
              )}
            >
              <Settings className="h-4 w-4" aria-hidden />
              <span className="sr-only">Settings</span>
            </Link>
            <Avatar src={session?.user?.image} name={session?.user?.name} size="sm" className="ml-0.5" />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => signOut({ callbackUrl: "/" })}
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
        <div className="flex items-stretch">
          {LINKS.map((link) => {
            const active = pathname.startsWith(link.href)
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors",
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
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors",
        active ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Icon className="h-4 w-4" aria-hidden />
      {label}
    </Link>
  )
}
