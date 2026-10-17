"use client"

import xray from "../../../../scripts/fixtures/assistant-xray.json"

/**
 * Canned answers for the assistant harness, so the assistant can be looked at with no OpenAI key and no
 * sign-in. It answers `/api/assistant*` inside the browser; nothing reaches a server or a model.
 * Add `?live=1` to the page URL to skip this and talk to the real route (needs a signed-in session and
 * OPENAI_API_KEY on the server).
 */

const briefing = `**Mostly tech-driven, and NVIDIA is doing the heavy lifting.** It is **34%** of this sample portfolio on its own, so one bad week there moves the whole result.

- Top 3 holdings are about 72% of the total
- Tech is the only sector with real weight
- Up on the period, but the gain is narrow

This is canned demo text: no model was called. See [your portfolio](/dashboard) for real numbers.

<follow_ups>
- Is NVIDIA too big a position?
- Compare the holdings in a table
- What are my biggest risks?
</follow_ups>`

const table = `Here is a quick comparison of the biggest holdings:

| Holding | Weight | Today |
|---|--:|--:|
| NVDA | 34% | +1.0% |
| VTI | 24% | +0.4% |
| AAPL | 15% | -0.9% |

1. Trimming concentration is a *general* idea, not advice.
2. A live assistant would call \`get_holdings\` for detail.

<follow_ups>
- What are my biggest risks?
- Start over with the portfolio briefing
</follow_ups>`

const risks = `**Concentration is the main risk.** A single stock is a third of the sample portfolio, and the top three are most of it.

- Single-name risk: NVDA at 34%
- Sector risk: almost everything is tech or tech-adjacent
- Little cash and no bonds to cushion a drawdown

Canned answer. With a real key the assistant reads your actual holdings.

<follow_ups>
- Compare the holdings in a table
</follow_ups>`

const fallback = `This harness only has a few canned answers. Try **Analyze my portfolio**, ask about **risks**, or ask for a **table**.

To talk to the real assistant, set OPENAI_API_KEY in apps/web/.env.local, restart \`npm run dev\`, sign in, and open the assistant from the sidebar (or add \`?live=1\` to this page).

<follow_ups>
- What are my biggest risks?
- Compare the holdings in a table
</follow_ups>`

const ndjson = (events: unknown[]) => events.map((e) => JSON.stringify(e)).join("\n") + "\n"

function answerFor(text: string, first: boolean): unknown[] {
  const q = text.toLowerCase()
  if (first || /analy|portfolio|brief|x-?ray|start over/.test(q)) {
    return [{ type: "status", stage: "reading" }, { type: "status", stage: "analyzing", label: "Running the portfolio X-Ray" }, { type: "xray", data: xray }, { type: "status", stage: "writing" }, { type: "text", delta: briefing }, { type: "done" }]
  }
  if (/table|compare|holding/.test(q)) return [{ type: "status", stage: "writing" }, { type: "text", delta: table }, { type: "done" }]
  if (/risk|big|too/.test(q)) return [{ type: "status", stage: "writing" }, { type: "text", delta: risks }, { type: "done" }]
  return [{ type: "status", stage: "writing" }, { type: "text", delta: fallback }, { type: "done" }]
}

function install() {
  if (typeof window === "undefined") return
  const w = window as unknown as { __pfCanned?: boolean }
  if (w.__pfCanned || new URLSearchParams(window.location.search).has("live")) return
  w.__pfCanned = true
  const real = window.fetch.bind(window)
  window.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url
    const path = url.replace(/^https?:\/\/[^/]+/, "").split("?")[0]
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } })
    if (path === "/api/assistant/status") return json({ available: true })
    if (path === "/api/assistant/scope") return json({ linked: 2, manual: 0 })
    if (path === "/api/assistant" && init?.method === "POST") {
      const body = JSON.parse(String(init.body ?? "{}")) as { messages?: { role: string; content: string }[] }
      const messages = body.messages ?? []
      const last = [...messages].reverse().find((m) => m.role === "user")?.content ?? ""
      const events = answerFor(last, messages.filter((m) => m.role === "user").length <= 1)
      const encoder = new TextEncoder()
      const stream = new ReadableStream({
        async start(controller) {
          for (const event of events) {
            controller.enqueue(encoder.encode(ndjson([event])))
            await new Promise((r) => setTimeout(r, 350))
          }
          controller.close()
        },
      })
      return new Response(stream, { status: 200, headers: { "Content-Type": "application/x-ndjson" } })
    }
    return real(input, init)
  }
}

install()

export function CannedAssistant() {
  return null
}
