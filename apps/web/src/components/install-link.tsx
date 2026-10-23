"use client"

import Link from "next/link"
import { Download } from "lucide-react"
import { Button } from "@web/components/ui/button"
import { useInstall } from "@web/lib/install-prompt"

/** Opens the browser's install dialog when it offers one, else the how-to page. */
export function InstallButton() {
  const { canPrompt, installed, ask } = useInstall()
  if (installed) return <p className="text-sm text-muted-foreground">Installed. You&apos;re using the app.</p>
  return canPrompt ? (
    <Button variant="outline" size="sm" onClick={() => void ask()}>
      <Download aria-hidden />
      Install
    </Button>
  ) : (
    <Button variant="outline" size="sm" asChild>
      <Link href="/install">
        <Download aria-hidden />
        See how
      </Link>
    </Button>
  )
}
