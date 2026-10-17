"use client"

import { useAssistant } from "@web/components/assistant/use-assistant"
import { OPEN_EVENT } from "@web/components/assistant/open-event"

/** One button per figure type: asks the canned assistant the question that draws it. */
const PROMPTS: [string, string][] = [
  ["X-Ray (full report)", "Analyze my portfolio"],
  ["Concentration bars", "What are my biggest risks?"],
  ["Holding spotlight", "Is NVIDIA too big a position?"],
  ["Compare table", "Compare NVDA and AAPL"],
  ["Performance", "How am I doing?"],
  ["Top contributors", "What moved today?"],
  ["Sector breakdown", "What sectors am I in?"],
  ["Asset mix bars", "What is my asset mix?"],
  ["Allocation donut", "Show my allocation as a ring"],
  ["Stat grid", "Give me my numbers at a glance"],
  ["What-if slider", "What if NVIDIA drops?"],
  ["Checklist", "What should I review?"],
  ["Timeline", "Walk me through a rebalancing plan"],
  ["Dividend calendar", "When do my dividends arrive?"],
  ["Vs the market (chart)", "How do I compare with the S&P 500 this quarter?"],
  ["Market today", "How is the market doing?"],
  ["Top movers", "What are the top movers?"],
  ["Earnings week", "Who reports earnings this week?"],
  ["Plain text (no figure)", "What is the S&P 500?"],
]

export function Gallery() {
  const { send } = useAssistant()
  return (
    <div className="flex flex-wrap gap-2 p-6">
      {PROMPTS.map(([label, q]) => (
        <button
          key={label}
          type="button"
          className="rounded-lg border px-3 py-1.5 text-xs opacity-80 hover:opacity-100"
          onClick={() => {
            window.dispatchEvent(new Event(OPEN_EVENT))
            send(q)
          }}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
