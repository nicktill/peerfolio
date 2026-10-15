import type { Metadata } from "next"
import { WealthLab } from "@web/components/wealth/wealth-lab"

export const metadata: Metadata = { title: "Wealth Lab" }

export default function WealthPage() {
  return <WealthLab />
}
