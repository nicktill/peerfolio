// Scripted prompt evals for the assistant. Runs the real system prompt and tool schemas against the real model
// with canned tool results, so it needs an OpenAI key but no database, login or running app.
//
//   OPENAI_API_KEY=sk-... node --experimental-strip-types apps/web/scripts/assistant-evals.mjs
//   ... assistant-evals.mjs --only=vague      run the cases whose name contains "vague"
//   ... assistant-evals.mjs --verbose         print every answer
//
// Skips (exit 0) when there is no key. Exits 1 when a case fails. A few cents per run.
import OpenAI from "openai"
import { readFileSync } from "node:fs"
import { buildInstructions } from "../src/lib/ai/prompt.ts"
import { TOOL_DEFS } from "../src/lib/ai/tool-defs.ts"
import { lintAnswer, wordCount } from "../src/lib/ai/style-lint.ts"
import { splitFollowUps } from "../src/lib/ai/followups.ts"
import { collectUrls, isKnownUrl, knownSet } from "../src/lib/ai/sources.ts"
import { digestXRay } from "../src/lib/ai/xray-digest.ts"

if (!process.env.OPENAI_API_KEY) {
  console.log("assistant evals: OPENAI_API_KEY is not set, skipping.")
  process.exit(0)
}

const args = process.argv.slice(2)
const only = args.find((a) => a.startsWith("--only="))?.slice(7)
const verbose = args.includes("--verbose")
const MODEL = process.env.ASSISTANT_AI_MODEL || "gpt-5-mini"
const client = new OpenAI({ maxRetries: 2, timeout: 60_000 })

const xray = JSON.parse(readFileSync(new URL("./fixtures/assistant-xray.json", import.meta.url), "utf8"))
const digest = digestXRay(xray)

// What the tools "return". Only these figures and addresses may appear in an answer.
const TOOLS = {
  get_current_view: (ctx) =>
    ctx.page === "leagues"
      ? { page: "leagues", league: "Friends & Family", range: "1M", members: 5, ranked: 5, you: { rank: 3, returnPercent: 2.1, gapToLeaderPoints: -3.4 }, standings: [{ rank: 1, member: "Maya", isYou: false, returnPercent: 5.5 }, { rank: 2, member: "Theo", isYou: false, returnPercent: 3.9 }, { rank: 3, member: "You", isYou: true, returnPercent: 2.1 }] }
      : ctx.page === "news"
        ? { page: "news", recap: { headline: "Stocks edge higher as chipmakers rally", takeaways: [{ title: "Chips lead", body: "Semiconductors rose 2%." }] }, headlines: [{ title: "Nvidia climbs on new chip demand", url: "https://news.example.com/nvidia-chip-demand", mentionsYourHoldings: ["NVDA"] }] }
        : { page: ctx.page, portfolio: digest, chartRange: ctx.range ?? null },
  get_portfolio_xray: () => digest,
  get_holdings: () => ({ holdings: digest.largest.map((h) => ({ ticker: h.name, weightPercent: h.weightPercent, todayPercent: 0.8 })) }),
  get_league_standings: () => TOOLS.get_current_view({ page: "leagues" }),
  get_fantasy_league: () => ({ reason: "The user isn't in any fantasy league." }),
  compare_to_benchmark: (_c, a) => ({ benchmark: a.symbol === "QQQ" ? "Nasdaq 100" : "S&P 500", basis: "price return (dividends not included)", window: { start: "2026-07-16", end: "2026-10-16", range: a.range }, yourReturnPercent: 4.2, benchmarkReturnPercent: 2.9, differencePoints: 1.3 }),
  get_market_news: () => TOOLS.get_current_view({ page: "news" }),
  get_market_snapshot: () => ({ session: "open", indexes: [{ name: "S&P 500", dayPercent: 0.4 }, { name: "Nasdaq 100", dayPercent: 0.7 }], sectors: [{ name: "Technology", dayPercent: 1.1 }, { name: "Energy", dayPercent: -0.6 }], fearAndGreed: 61 }),
  get_quotes: () => ({ quotes: [{ symbol: "NVDA", price: 184.2, changePercent: 1.0 }] }),
  get_top_movers: () => ({ gainers: [{ symbol: "AMD", changePercent: 4.1, held: false }], losers: [{ symbol: "XOM", changePercent: -1.9, held: true }] }),
  get_earnings_calendar: () => ({ days: [] }),
  project_wealth: () => ({ assumptions: { startingValue: 92500, monthlyContribution: 1500, years: 25, expectedAnnualReturnPct: 7, inflationPct: 2.5 }, result: { endValue: 1_870_000, endValueTodaysDollars: 1_010_000 }, note: "hypothetical, not a prediction" }),
}

const PRIOR = [
  { role: "user", content: "How am I doing vs the S&P?" },
  { role: "assistant", content: "You are ahead: **+4.2%** over the past 3 months against +2.9% for the S&P 500, a lead of 1.3 points." },
]

const CASES = [
  { name: "analyze-portfolio", page: "portfolio", ask: "Analyze my portfolio", briefing: true, firstTool: ["get_current_view", "get_portfolio_xray"] },
  { name: "position-size", page: "portfolio", holding: "NVDA", ask: "Is NVDA too big a position?", firstTool: ["get_current_view", "get_portfolio_xray", "get_holdings"] },
  { name: "vs-sp500", page: "portfolio", range: "3M", ask: "How am I doing vs the S&P?", mustCall: ["compare_to_benchmark"] },
  { name: "vague", page: "portfolio", ask: "Is my portfolio good?", clarifying: true, noTools: true },
  { name: "biggest-holding", page: "portfolio", ask: "What's my biggest holding?", maxTools: 1 },
  { name: "league-rank", page: "leagues", ask: "Why am I ranked here?", firstTool: ["get_current_view", "get_league_standings"] },
  { name: "market-today", page: "news", ask: "Summarize today's market", anyTool: ["get_market_snapshot", "get_market_news", "get_current_view"] },
  { name: "no-invented-links", page: "portfolio", ask: "Give me a link to read more about NVIDIA's earnings.", noUnknownUrls: true },
  { name: "wealth-whatif", page: "wealth", ask: "What if I invest $1,500 a month for 25 years?", mustCall: ["project_wealth"] },
  { name: "follow-up-nasdaq", page: "portfolio", history: PRIOR, ask: "And against the Nasdaq?", mustCall: ["compare_to_benchmark"] },
  { name: "small-talk", page: "portfolio", ask: "thanks!", noTools: true, maxWords: 40, skipFollowUps: true },
  { name: "advice-boundary", page: "portfolio", ask: "Should I sell NVDA?", forbid: /\byou should (sell|buy|hold)\b/i },
  { name: "today-moves", page: "portfolio", ask: "Which of my stocks are up today?", mustCall: ["get_holdings"] },
]

const numbersIn = (text) => [...text.matchAll(/\d[\d,]*(?:\.\d+)?/g)].map((m) => m[0].replace(/,/g, ""))

async function runCase(c) {
  const ctx = { page: c.page, range: c.range }
  const instructions = buildInstructions({
    today: "Friday, October 16, 2026, 10:30 AM EDT",
    marketOpen: true,
    context: { page: c.page, range: c.range, holding: c.holding },
    entityName: c.page === "leagues" ? "Friends & Family" : null,
    brief: `Their portfolio (stored prices): $92,500 across 8 holdings.\nToday so far: +$645 (+0.70%).\nLargest: NVDA 33.5% (+1.0% today), VTI 23.8%, AAPL 15.1%.`,
  })
  const input = [...(c.history ?? []), { role: "user", content: c.ask }]
  const calls = []
  const seenOutputs = []
  let text = ""
  for (let round = 0; round < 4; round++) {
    const res = await client.responses.create({
      model: MODEL,
      instructions,
      input,
      tools: TOOL_DEFS,
      reasoning: { effort: "low" },
      ...(MODEL.startsWith("gpt-5") ? { text: { verbosity: "low" } } : {}),
      max_output_tokens: 2500,
      store: false,
    })
    input.push(...res.output)
    const fns = res.output.filter((o) => o.type === "function_call")
    text = res.output_text ?? ""
    if (fns.length === 0) break
    for (const f of fns) {
      let a = {}
      try {
        a = JSON.parse(f.arguments || "{}")
      } catch {}
      calls.push({ name: f.name, args: a })
      const out = TOOLS[f.name] ? TOOLS[f.name](ctx, a) : { error: "unknown tool" }
      seenOutputs.push(JSON.stringify(out))
      input.push({ type: "function_call_output", call_id: f.call_id, output: JSON.stringify(out) })
    }
  }

  const failures = []
  const warnings = []
  const { body, followUps } = splitFollowUps(text)
  const style = lintAnswer(text, { briefing: c.briefing, clarifying: c.clarifying, maxWords: c.maxWords })
  for (const p of style) (c.skipFollowUps && p.includes("follow-ups") ? warnings : failures).push(`style: ${p}`)

  const names = calls.map((x) => x.name)
  if (c.firstTool && !c.firstTool.includes(names[0])) failures.push(`first tool was ${names[0] ?? "none"}, wanted one of ${c.firstTool.join(", ")}`)
  for (const t of c.mustCall ?? []) if (!names.includes(t)) failures.push(`never called ${t}`)
  if (c.anyTool && !names.some((n) => c.anyTool.includes(n))) failures.push(`called none of ${c.anyTool.join(", ")}`)
  if (c.noTools && names.length > 0) failures.push(`called tools (${names.join(", ")}) when it should have just answered`)
  if (c.maxTools != null && names.length > c.maxTools) failures.push(`called ${names.length} tools, wanted at most ${c.maxTools}`)
  if (c.forbid?.test(body)) failures.push(`said something it should not: ${body.match(c.forbid)[0]}`)

  // Links: every address must have come from a tool result (or the person's own message).
  const known = knownSet([...seenOutputs.flatMap(collectUrls), ...collectUrls(c.ask)])
  for (const url of collectUrls(body)) if (!isKnownUrl(url, known)) failures.push(`invented link: ${url}`)

  // Figures: every number in the answer should be traceable to a tool result, the brief or the question. Arithmetic
  // on them is allowed, so an untraceable number is a warning to read, not a failure.
  const evidence = new Set(numbersIn([...seenOutputs, instructions.slice(instructions.indexOf("Their portfolio")), c.ask, ...(c.history ?? []).map((h) => h.content)].join(" ")))
  const stray = numbersIn(body).filter((n) => n.length >= 2 && !evidence.has(n) && !evidence.has(String(Math.round(Number(n)))))
  if (stray.length) warnings.push(`figures not found in tool data (arithmetic?): ${[...new Set(stray)].join(", ")}`)

  return { c, names, words: wordCount(body), followUps: followUps.length, failures, warnings, text }
}

const selected = CASES.filter((c) => !only || c.name.includes(only))
let failed = 0
console.log(`assistant evals: ${selected.length} cases on ${MODEL}\n`)
for (const c of selected) {
  try {
    const r = await runCase(c)
    const ok = r.failures.length === 0
    if (!ok) failed++
    console.log(`${ok ? "PASS" : "FAIL"}  ${c.name.padEnd(20)} ${String(r.words).padStart(3)} words  tools: ${r.names.join(" > ") || "none"}`)
    for (const f of r.failures) console.log(`        - ${f}`)
    for (const w of r.warnings) console.log(`        ~ ${w}`)
    if (verbose || !ok) console.log(`\n${r.text.replace(/^/gm, "        | ")}\n`)
  } catch (e) {
    failed++
    console.log(`FAIL  ${c.name.padEnd(20)} error: ${e instanceof Error ? e.message : e}`)
  }
}
console.log(`\n${selected.length - failed}/${selected.length} passed`)
process.exit(failed ? 1 : 0)
