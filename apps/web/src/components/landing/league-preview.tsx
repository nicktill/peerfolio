"use client"

import { InView } from "@web/components/motion/in-view"
import { Card, CardContent, CardHeader, CardTitle } from "@web/components/ui/card"
import { RaceChart } from "@web/components/charts/race-chart"
import { StandingRow } from "@web/components/leagues/standing-row"
import { DEMO_STANDINGS } from "@web/components/landing/demo"

/** A league as it appears in the app, drawn by the same components. */
export function LeaguePreview() {
  return (
    <div className="grid gap-3 lg:grid-cols-5">
      <InView className="lg:col-span-3">
      <Card>
        <CardHeader>
          <CardTitle>
            <span aria-hidden>🏆</span> The Group Chat
          </CardTitle>
          <p className="text-xs text-muted-foreground">Last 30 days · everyone indexed to 100</p>
        </CardHeader>
        <CardContent>
          <RaceChart
            height={320}
            series={DEMO_STANDINGS.map((s) => ({
              id: s.userId,
              label: s.name?.split(" ")[0] ?? "",
              points: s.spark,
              isYou: s.isYou,
            }))}
          />
        </CardContent>
      </Card>
      </InView>

      <InView index={1} className="lg:col-span-2">
      <Card>
        <CardHeader>
          <CardTitle>Standings</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            {DEMO_STANDINGS.map((standing, i) => (
              <StandingRow key={standing.userId} standing={standing} index={i} />
            ))}
          </ul>
        </CardContent>
      </Card>
      </InView>
    </div>
  )
}
