import { MarketBoard } from "@web/components/sports/market-board"
import { SportsHoldGate } from "@web/components/sports/sports-on-hold"

export const metadata = { title: "Sports market" }

export default function SportsMarketPage() {
  return (
    <SportsHoldGate>
      <MarketBoard />
    </SportsHoldGate>
  )
}
