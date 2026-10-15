import "server-only"
import { summarizeHoldings } from "@web/lib/dashboard-math"
import { loadPositions, loadXRay } from "@web/lib/ai/portfolio-data"
import type { XRay } from "@web/lib/ai/portfolio-xray"

/**
 * The assistant's tools: read-only, and bound to the signed-in user when they
 * are built. The model supplies arguments (a count at most); it never supplies
 * a user id, so no argument can reach another person's data.
 */

export type ToolContext = {
  userId: string
  /** Called when a tool produces something the interface should render itself. */
  emit: (event: { type: "xray"; data: XRay }) => void
}

export type ToolDef = {
  type: "function"
  name: string
  description: string
  parameters: Record<string, unknown>
  strict: true
}

export const TOOL_DEFS: ToolDef[] = [
  {
    type: "function",
    name: "get_portfolio_xray",
    description:
      "Runs the Portfolio X-Ray on the signed-in user's own holdings: allocation, concentration, performance and flagged risks, all computed by Peerfolio. The interface shows the full report to the user, so summarize rather than repeat it.",
    parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
    strict: true,
  },
  {
    type: "function",
    name: "get_holdings",
    description: "The user's largest holdings, one row per security across all accounts, with weight and gain where known.",
    parameters: {
      type: "object",
      properties: { limit: { type: "integer", description: "How many holdings to return, 1-25." } },
      required: ["limit"],
      additionalProperties: false,
    },
    strict: true,
  },
]

const round = (v: number | null, places = 2) => (v == null ? null : Math.round(v * 10 ** places) / 10 ** places)

export async function runTool(name: string, rawArgs: string, ctx: ToolContext): Promise<unknown> {
  switch (name) {
    case "get_portfolio_xray": {
      const xray = await loadXRay(ctx.userId)
      ctx.emit({ type: "xray", data: xray })
      return xray
    }
    case "get_holdings": {
      let limit = 10
      try {
        const parsed = JSON.parse(rawArgs) as { limit?: unknown }
        if (typeof parsed.limit === "number" && Number.isFinite(parsed.limit)) limit = Math.min(25, Math.max(1, Math.trunc(parsed.limit)))
      } catch {
        // Bad arguments fall back to the default rather than failing the turn.
      }
      const rows = summarizeHoldings(await loadPositions(ctx.userId)).slice(0, limit)
      return {
        holdings: rows.map((r) => ({
          ticker: r.ticker,
          name: r.name,
          type: r.type,
          value: round(r.value),
          weightPercent: round(r.weight),
          todayPercent: round(r.todayPercent),
          gainPercent: round(r.gainPercent),
          accounts: r.positions,
        })),
      }
    }
    default:
      return { error: `Unknown tool: ${name}` }
  }
}
