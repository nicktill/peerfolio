"use client"

import { InView } from "@web/components/motion/in-view"
import { Card, CardContent, CardHeader, CardTitle } from "@web/components/ui/card"
import { RaceChart } from "@web/components/charts/race-chart"
import { StandingRow } from "@web/components/leagues/standing-row"
import { DEMO_STANDINGS } from "@web/components/landing/demo"

const chart = (height: number) => (
  <RaceChart
    height={height}
    series={DEMO_STANDINGS.map((s) => ({
      id: s.userId,
      label: s.name?.split(" ")[0] ?? "",
      points: s.spark,
      isYou: s.isYou,
    }))}
  />
)

/** A league as it appears in the app, drawn by the same components. */
export function LeaguePreview() {
  return (
    <div className="grid gap-3 lg:grid-cols-5">
      <InView className="lg:col-span-3 [&>*]:h-full">
      <Card className="flex flex-col">
        <CardHeader>
          <CardTitle>
            <span aria-hidden>🏆</span> The Group Chat
          </CardTitle>
          <p className="text-xs text-muted-foreground">Last 30 days · everyone indexed to 100</p>
        </CardHeader>
        {/* Side by side, the standings list is the taller card; a taller chart keeps the two level. */}
        <CardContent className="flex flex-1 items-center">
          <div className="w-full lg:hidden">{chart(320)}</div>
          <div className="hidden w-full lg:block">{chart(480)}</div>
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
            {DEMO_STANDINGS.map((standing) => (
              <StandingRow key={standing.userId} standing={standing} />
            ))}
          </ul>
        </CardContent>
      </Card>
      </InView>
    </div>
  )
}
