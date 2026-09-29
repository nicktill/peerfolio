"use client"

import { useEffect } from "react"
import { TriangleAlert } from "lucide-react"
import { Button } from "@web/components/ui/button"
import { Card, CardContent } from "@web/components/ui/card"
import { EmptyState } from "@web/components/ui/empty-state"

/** Something in a page threw: keep the nav, say what happened, and offer a retry. */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[app] page error", error)
  }, [error])

  return (
    <Card>
      <CardContent className="pt-5">
        <EmptyState
          icon={TriangleAlert}
          title="That didn't load"
          description="Something went wrong on our side. Your data is safe. Give it another try."
          action={<Button onClick={reset}>Try again</Button>}
        />
      </CardContent>
    </Card>
  )
}
