"use client"

import { InView } from "@web/components/motion/in-view"
import { RaceChart } from "@web/components/charts/race-chart"
import { StandingRow } from "@web/components/leagues/standing-row"
import { DEMO_STANDINGS } from "@web/components/landing/demo"

/** A league as it appears in the app, drawn by the same components. */
export function LeaguePreview() {
  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <InView className="lg:col-span-3">
      <div className="pf-panel h-full">
        <div className="pf-ph">
          <h3 className="pf-label">The Group Chat<em>Last 30 days · indexed to 100</em></h3>
        </div>
        <div className="pf-pb">
          <RaceChart
            height={320}
            series={DEMO_STANDINGS.map((s) => ({
              id: s.userId,
              label: s.name?.split(" ")[0] ?? "",
              points: s.spark,
              isYou: s.isYou,
            }))}
          />
        </div>
      </div>
      </InView>

      <InView index={1} className="lg:col-span-2">
      <div className="pf-panel h-full">
        <div className="pf-ph">
          <h3 className="pf-label">Standings</h3>
        </div>
        <div className="px-4 pb-1">
          <ul className="divide-y">
            {DEMO_STANDINGS.map((standing, i) => (
              <StandingRow key={standing.userId} standing={standing} index={i} />
            ))}
          </ul>
        </div>
      </div>
      </InView>
    </div>
  )
}
