"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { signOut, useSession } from "next-auth/react"
import { Activity, Gamepad2, LineChart, Repeat, LayoutDashboard, ChevronDown, LogOut, Newspaper, Settings, ShieldCheck, Trophy, Users } from "lucide-react"
import { OPEN_EVENT } from "@web/components/assistant/open-event"
import { Orb } from "@web/components/assistant/orb"
import { cn } from "@web/lib/utils"
import { useApi } from "@web/lib/use-api"
import { cacheClear } from "@web/lib/api-cache"
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
  // Sidebar only: the mobile tab bar is a fixed five-column grid, so Wealth is reached from the mobile header instead.
  { href: "/wealth", label: "Wealth", icon: LineChart, sidebarOnly: true },
]
const TAB_LINKS = LINKS.filter((link) => !("sidebarOnly" in link))

function Brand() {
  return (
    <Link href="/dashboard" aria-label="Peerfolio home" className="peerfolio-brand">
      <Image src="/logo.png" alt="" width={30} height={30} data-brand-logo className="peerfolio-logo" />
      <span>Peerfolio</span>
    </Link>
  )
}

export function AppNav() {
  const pathname = usePathname()
  const { data: session, status } = useSession()
  const { data: brokerageAccess, error: accessError } = useApi<{ admin: boolean }>(status === "authenticated" ? "/api/plaid/access" : null, [], { refreshMs: 60_000 })
  const activeHref = LINKS.find((link) => pathname.startsWith(link.href))?.href ?? null
  const admin = brokerageAccess?.admin && !accessError
  const assistant = useApi<{ available: boolean }>(status === "authenticated" ? "/api/assistant/status" : null)
  const assistantReady = !!assistant.data?.available
  const onAdmin = pathname.startsWith("/admin")
  // The admin pages share one folded entry; it opens on its own when you're on one of them, and remembers your choice.
  const [adminOpen, setAdminOpen] = useState(false)
  useEffect(() => {
    try {
      setAdminOpen(onAdmin || localStorage.getItem("pf-nav-admin") === "1")
    } catch {
      setAdminOpen(onAdmin)
    }
  }, [onAdmin])
  const toggleAdmin = () => {
    const next = !adminOpen
    setAdminOpen(next)
    try {
      localStorage.setItem("pf-nav-admin", next ? "1" : "0")
    } catch {
      // Not remembered; it still works for this visit.
    }
  }
  const [hint, setHint] = useState("")
  useEffect(() => setHint(/mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent) ? "⌘/" : "Ctrl /"), [])

  function logout() {
    cacheClear()
    void signOut({ callbackUrl: "/" })
  }

  const avatar = status === "loading" ? (
    <Skeleton className="h-8 w-8 rounded-full" />
  ) : (
    <Avatar src={session?.user?.image} name={session?.user?.name} size="md" />
  )

  return (
    <>
      <aside className="peerfolio-sidebar">
        <Brand />
        <nav aria-label="Primary navigation" className="peerfolio-sidebar-links">
          <span aria-hidden className="peerfolio-nav-ind" data-off={activeHref ? undefined : ""} style={{ "--i": Math.max(0, LINKS.findIndex((l) => l.href === activeHref)) } as React.CSSProperties} />
          {LINKS.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className="peerfolio-nav-link" aria-current={activeHref === href ? "page" : undefined}>
              <Icon size={16} strokeWidth={1.5} aria-hidden />
              <span>{label}</span>
            </Link>
          ))}
          {admin ? (
            <div className={cn("pf-nav-group", adminOpen && "is-open")}>
              <button type="button" className="peerfolio-nav-link pf-nav-group-b" aria-expanded={adminOpen} aria-controls="pf-nav-admin" onClick={toggleAdmin}>
                <ShieldCheck size={16} strokeWidth={1.5} aria-hidden />
                <span>Admin</span>
                <ChevronDown size={14} aria-hidden className="pf-nav-chev" />
              </button>
              <div className="pf-nav-reveal" id="pf-nav-admin" role="group" aria-label="Admin pages">
                <div inert={!adminOpen}>
                  <div className="pf-nav-sub">
                    <Link href="/admin/brokerages" className="peerfolio-nav-link" aria-current={pathname.startsWith("/admin/brokerages") ? "page" : undefined}>
                      <span>Manage brokerages</span>
                    </Link>
                    <Link href="/admin/providers" className="peerfolio-nav-link" aria-current={pathname === "/admin/providers" ? "page" : undefined}>
                      <span>Provider usage</span>
                    </Link>
                    <Link href="/admin/syncs" className="peerfolio-nav-link" aria-current={pathname === "/admin/syncs" ? "page" : undefined}>
                      <span>Brokerage syncs</span>
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </nav>
        <div className="peerfolio-sidebar-footer">
          <Link href="/settings" className="peerfolio-nav-link" aria-current={pathname === "/settings" ? "page" : undefined}>
            <Settings size={16} strokeWidth={1.5} aria-hidden />Settings
          </Link>
          {assistantReady ? (
            <button type="button" className="pf-nav-ask" onClick={() => window.dispatchEvent(new Event(OPEN_EVENT))} aria-keyshortcuts="Control+Slash Meta+Slash">
              <Orb size={26} />
              <span className="pf-nav-ask-t">
                <b>Ask anything</b>
                <small>Knows your holdings</small>
              </span>
              <kbd>{hint}</kbd>
            </button>
          ) : null}
          <ThemeToggle variant="segmented" />
          <div className="peerfolio-account">
            {avatar}
            <div className="min-w-0 flex-1"><b className="truncate">{status === "loading" ? "Your account" : session?.user?.name || "Your account"}</b><small className="truncate">{session?.user?.email || "Personal workspace"}</small></div>
            <Button variant="ghost" size="icon" onClick={logout} aria-label="Sign out" title="Sign out"><LogOut size={16} aria-hidden /></Button>
          </div>
        </div>
      </aside>
      <header className="peerfolio-mobile-header">
        <Brand />
        <div className="flex items-center gap-1">
          <ThemeToggle />
          {admin ? <Link href="/admin/brokerages" className="peerfolio-mobile-control" aria-label="Manage brokerage access"><ShieldCheck size={17} aria-hidden /></Link> : null}
          {admin ? <Link href="/admin/providers" className="peerfolio-mobile-control" aria-label="Provider usage"><Activity size={17} aria-hidden /></Link> : null}
          {admin ? <Link href="/admin/syncs" className="peerfolio-mobile-control" aria-label="Brokerage syncs"><Repeat size={17} aria-hidden /></Link> : null}
          <Link href="/wealth" className="peerfolio-mobile-control" aria-label="Wealth Lab"><LineChart size={17} aria-hidden /></Link>
          <Link href="/settings" className="peerfolio-mobile-control" aria-label="Settings"><Settings size={17} aria-hidden /></Link>
          {avatar}
        </div>
      </header>
      <nav className="peerfolio-tabbar" aria-label="Mobile primary navigation">
        {TAB_LINKS.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} aria-current={activeHref === href ? "page" : undefined} className={cn("peerfolio-tab", activeHref === href && "peerfolio-tab-active")}>
            <Icon size={19} strokeWidth={1.5} aria-hidden />{label}
          </Link>
        ))}
      </nav>
    </>
  )
}
