"use client"

import xray from "../../../../scripts/fixtures/assistant-xray.json"
import type { XRay } from "@web/lib/ai/portfolio-xray"
import { figureFor, specToFigure, type FigureKind } from "@web/lib/ai/figures"
import type { Visual } from "@web/lib/ai/visuals"

/**
 * Canned answers for the assistant harness, so the assistant can be looked at with no OpenAI key and no
 * sign-in. It answers `/api/assistant*` inside the browser; nothing reaches a server or a model.
 * Add `?live=1` to the page URL to skip this and talk to the real route (needs a signed-in session and
 * OPENAI_API_KEY on the server).
 */

const fu = (...q: string[]) => `\n\n<follow_ups>\n${q.map((x) => `- ${x}`).join("\n")}\n</follow_ups>`
const canned = " Canned demo text: no model was called."

const briefing =
  `**Mostly tech-driven, and NVIDIA is doing the heavy lifting.** It is **34%** of this sample portfolio on its own, so one bad week there moves the whole result.\n\n- Top 3 holdings are about 72% of the total\n- Tech is the only sector with real weight\n- Up on the period, but the gain is narrow\n\nSee [your portfolio](/dashboard) for real numbers.` +
  fu("Is NVIDIA too big a position?", "What are my biggest risks?", "How am I doing?")

const risks =
  `**Concentration is the main risk.** One stock is a third of the sample portfolio, and the top three are most of it.\n\nSector tilt adds to it: almost every stock is technology.${canned}` +
  fu("What sectors am I in?", "Compare NVDA and AAPL", "What moved today?")

const holding =
  `**Yes, by the usual rule of thumb.** NVIDIA is about **34%** of the portfolio, past the 25% mark where one position starts to drive the result. That is general knowledge, not advice.${canned}` +
  fu("Compare NVDA and AAPL", "How am I doing?")

const compare =
  `NVIDIA is more than twice Apple's weight and is up today, while Apple is down. Weight is what matters most here.${canned}` +
  fu("What sectors am I in?", "What moved today?")

const performance =
  `**Up modestly.** The sample portfolio is ahead over the past 3 months and today, with a mild worst drawdown for a tech-heavy mix.${canned}` +
  fu("What moved today?", "What is my asset mix?", "What are my biggest risks?")

const contributors =
  `**NVIDIA and the total-market fund did the lifting;** Apple gave some back.${canned}` +
  fu("How am I doing?", "What is the S&P 500?")

const sectors =
  `**Technology is the whole story.** It is most of your stocks, with financials and energy as small slices.${canned}` +
  fu("What is my asset mix?", "Is NVIDIA too big a position?")

const mix =
  `**Two-thirds individual stocks,** a quarter in an ETF, and small crypto and cash positions.${canned}` +
  fu("What sectors am I in?", "How am I doing?")

const plain =
  `The S&P 500 is an index of about 500 large US companies, weighted by size. Funds like SPY and VOO track it. This one is a plain answer with no figure on purpose.${canned}` +
  fu("What are my biggest risks?", "Analyze my portfolio")

const fallback =
  `This harness has canned answers for the follow-up chips. Try **Analyze my portfolio**, **How am I doing?**, **What are my biggest risks?** or **What sectors am I in?**.\n\nTo talk to the real assistant, set OPENAI_API_KEY in apps/web/.env.local, restart \`npm run dev\`, sign in, and open the assistant from the sidebar (or add \`?live=1\` to this page).` +
  fu("Analyze my portfolio", "What are my biggest risks?")

const donut = `**Two-thirds in stocks.** The ring shows where the sample money sits; the middle is the total.${canned}` + fu("What if NVIDIA drops?", "Give me my numbers at a glance")
const stats = `Eight holdings, but only about **4.8** behave like equal-sized ones, because the top few dominate.${canned}` + fu("What should I review?", "Show my allocation as a ring")
const scenario = `Drag the slider to stress NVIDIA. It is a third of the total, so a 20% drop costs about 6.7% of the whole. Plain arithmetic, not a forecast.${canned}` + fu("What are my biggest risks?", "What should I review?")
const checklist = `Three things are worth a look, from most to least pressing. Tick them off as you go.${canned}` + fu("Walk me through a rebalancing plan", "What if NVIDIA drops?")
const timeline = `A gentle way to reduce the single-stock tilt, spread over a few months. General education, not advice.${canned}` + fu("When do my dividends arrive?", "What are my biggest risks?")
const calendar = `Illustrative only: the sample portfolio has no dividend data connected, so these dates and amounts are demo values.${canned}` + fu("How is the market doing?", "Analyze my portfolio")
const benchmark = `Ahead of the S&P 500 by about 1.3 points over three months (price return, deposits removed).${canned}` + fu("What are the top movers?", "How am I doing?")
const market = `A mild green day, led by tech.${canned}` + fu("What are the top movers?", "Who reports earnings this week?")
const movers = `Chips led, energy lagged. Two of the names are ones you hold.${canned}` + fu("Who reports earnings this week?", "How is the market doing?")
const earnings = `Three of your holdings report this week; the highlighted tickers are yours.${canned}` + fu("How do I compare with the S&P 500 this quarter?", "What is the S&P 500?")

const data = xray as unknown as XRay
const show = (card: Visual | null): unknown[] => (card ? [{ type: "visual", data: card }] : [])
const spec = (type: string, title: string, items: [string, string | null, number | null, string | null][]) =>
  show(specToFigure({ type, title, items: items.map(([label, value, number, detail]) => ({ label, value, number, detail })) }))
const DEMO: Record<string, unknown[]> = {
  timeline: spec("timeline", "Trim NVDA over three months", [
    ["Set a target weight", "This week", null, "Pick the share you would be comfortable with"],
    ["Sell the first third", "November", null, "Check the tax impact before you do"],
    ["Add to the broad fund", "December", null, null],
    ["Review again", "January", null, "Weights drift; one look a quarter is plenty"],
  ]),
  calendar: spec("calendar", "Expected dividends (demo)", [
    ["VTI", "Dec 22", 61, null],
    ["AAPL", "Nov 14", 36, null],
    ["MSFT", "Dec 11", 28, null],
    ["JPM", "Jan 6", 42, null],
  ]),
  benchmark: [{ type: "visual", data: { kind: "benchmark", label: "S&P 500", range: "3M", you: 4.2, benchmark: 2.9, lines: { you: [100, 100.8, 101.4, 101.1, 102.3, 102.9, 103.6, 103.2, 104.2], bench: [100, 100.5, 100.9, 101.6, 101.2, 101.9, 102.2, 102.5, 102.9] } } }],
  market: [{ type: "visual", data: { kind: "market", session: "open", indexes: [{ name: "S&P 500", dayPercent: 0.4 }, { name: "Nasdaq", dayPercent: 0.7 }, { name: "Dow", dayPercent: 0.1 }], sectors: [{ name: "Technology", dayPercent: 1.1 }, { name: "Financials", dayPercent: 0.3 }, { name: "Health care", dayPercent: -0.1 }, { name: "Energy", dayPercent: -0.8 }] } }],
  movers: [{ type: "visual", data: { kind: "movers", gainers: [{ symbol: "NVDA", changePercent: 2.4, held: true }, { symbol: "AMD", changePercent: 1.9, held: false }, { symbol: "AVGO", changePercent: 1.5, held: false }], losers: [{ symbol: "XOM", changePercent: -1.6, held: false }, { symbol: "AAPL", changePercent: -0.9, held: true }, { symbol: "PFE", changePercent: -0.7, held: false }] } }],
  earnings: [{ type: "visual", data: { kind: "earnings", days: [{ day: "Tue", reports: [{ symbol: "MSFT", when: "after-close", held: true }, { symbol: "KO", when: "before-open", held: false }] }, { day: "Wed", reports: [{ symbol: "AAPL", when: "after-close", held: true }, { symbol: "META", when: "after-close", held: false }] }, { day: "Thu", reports: [{ symbol: "JPM", when: "before-open", held: true }] }] } }],
}
const visual = (kind: FigureKind, focus?: string[]): unknown[] => {
  const card = figureFor(kind, data, focus)
  return card ? [{ type: "visual", data: card }] : []
}
const writing = (text: string) => [{ type: "status", stage: "writing" }, { type: "text", delta: text }, { type: "done" }]
const withFigure = (figure: unknown[], text: string) => [{ type: "status", stage: "reading" }, ...figure, ...writing(text)]

const ndjson = (events: unknown[]) => events.map((e) => JSON.stringify(e)).join("\n") + "\n"

const KNOWN = /ring|donut|glance|numbers|what if|review|rebalanc|timeline|dividend|income|earnings|quarter|market|movers|compare|table|side by side|too big|too much|position|nvidia|nvda|risk|concentrat|divers|how am i doing|perform|return|moved|mover|today|contribut|sector|mix|allocation|asset|s&p|what is|explain|holding/

/** Each question shape gets its own figure, the way the live assistant picks one; "plain" has none. */
function answerFor(text: string, first: boolean): unknown[] {
  const q = text.toLowerCase()
  if (/analy|brief|x-?ray|start over/.test(q) || (first && !KNOWN.test(q))) {
    return [{ type: "status", stage: "reading" }, { type: "status", stage: "analyzing", label: "Running the portfolio X-Ray" }, { type: "xray", data: xray }, ...writing(briefing)]
  }
  if (/\bring\b|donut|allocation/.test(q)) return withFigure(visual("donut"), donut)
  if (/glance|numbers|stats/.test(q)) return withFigure(visual("stats"), stats)
  if (/what if|drop|stress/.test(q)) return withFigure(visual("scenario", ["NVDA"]), scenario)
  if (/review|checklist|to do/.test(q)) return withFigure(visual("checklist"), checklist)
  if (/rebalanc|plan|timeline/.test(q)) return withFigure(DEMO.timeline!, timeline)
  if (/dividend|income/.test(q)) return withFigure(DEMO.calendar!, calendar)
  if (/earnings/.test(q)) return withFigure(DEMO.earnings!, earnings)
  if (/\bvs\b|compare with|against|s&p.*quarter|quarter/.test(q)) return withFigure(DEMO.benchmark!, benchmark)
  if (/top movers|biggest movers/.test(q)) return withFigure(DEMO.movers!, movers)
  if (/market doing|how is the market/.test(q)) return withFigure(DEMO.market!, market)
  if (/compare|table|side by side|holdings/.test(q)) return withFigure(visual("compare", ["NVDA", "AAPL"]), compare)
  if (/too big|too much|position|spotlight|nvidia|nvda/.test(q)) return withFigure(visual("holding", ["NVDA"]), holding)
  if (/risk|concentrat|divers/.test(q)) return withFigure(visual("risk"), risks)
  if (/how am i doing|perform|return/.test(q)) return withFigure(visual("performance"), performance)
  if (/moved|mover|today|contribut/.test(q)) return withFigure(visual("contributors"), contributors)
  if (/sector/.test(q)) return withFigure(visual("sectors"), sectors)
  if (/mix|allocation|asset/.test(q)) return withFigure(visual("mix"), mix)
  if (/s&p|what is|explain/.test(q)) return writing(plain)
  return writing(fallback)
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
