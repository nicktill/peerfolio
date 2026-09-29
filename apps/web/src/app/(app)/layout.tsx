import { AppShell } from "@web/components/app-shell"

/**
 * The signed-in area. Deliberately free of server-side session reads: reading
 * cookies here would make every page below dynamic, adding a server round-trip
 * to each navigation. Pages stay static (instant to move between); the shell
 * renders straight away and steps aside if the session turns out to be missing.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>
}
