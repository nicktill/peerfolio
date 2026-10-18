import OpenAI from "openai"
import { NextResponse } from "next/server"
import { getCurrentUserId } from "@web/lib/auth"
import { ASSISTANT_MODEL, LIMITS, WEB_SEARCHES_PER_DAY, WEB_SEARCH_USD, assistantConfigured, cleanContext, cleanHistory, compactHistory, costOf, isSmallTalk, needsWeb, tokenBound, webSearchEnabled, worstCaseUsd } from "@web/lib/ai/limits"
import { loadPositions } from "@web/lib/ai/portfolio-data"
import { portfolioBrief } from "@web/lib/ai/portfolio-brief"
import { reserve, settle } from "@web/lib/ai/usage"
import { TOOL_DEFS, runTool } from "@web/lib/ai/tools"
import type { XRay } from "@web/lib/ai/portfolio-xray"
import type { Visual } from "@web/lib/ai/visuals"
import { buildInstructions } from "@web/lib/ai/prompt"
import { withoutFollowUps } from "@web/lib/ai/followups"
import { collectUrls, type Source } from "@web/lib/ai/sources"
import { toolLabel } from "@web/lib/ai/tool-labels"
import { verifyPageEntity } from "@web/lib/ai/page-entity"
import { isUsMarketOpen } from "@web/lib/market-hours"

export const runtime = "nodejs"
export const maxDuration = 60

/** What the browser receives, one JSON object per line. */
export type AssistantEvent =
  | { type: "status"; stage: "reading" | "analyzing" | "writing"; label?: string }
  | { type: "text"; delta: string }
  | { type: "xray"; data: XRay }
  | { type: "visual"; data: Visual }
  | { type: "link"; label: string; href: string }
  | { type: "sources"; items: Source[] }
  | { type: "error"; message: string }
  | { type: "done" }

/** Web searches per person in the last day. Per server instance and best effort: the dollar cap is the real backstop. */
const webUse = new Map<string, number[]>()
function webSearchesLeft(userId: string): number {
  const recent = (webUse.get(userId) ?? []).filter((t) => Date.now() - t < 86_400_000)
  webUse.set(userId, recent)
  if (webUse.size > 2000) webUse.clear()
  return WEB_SEARCHES_PER_DAY - recent.length
}

const client = () => {
  const apiKey = process.env.OPENAI_API_KEY
  return apiKey ? new OpenAI({ apiKey, maxRetries: 0, timeout: 55_000 }) : null
}

type Item = Record<string, unknown>

export async function POST(request: Request) {
  const userId = await getCurrentUserId()
  if (!userId) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

  const body = (await request.json().catch(() => null)) as { messages?: unknown; context?: unknown } | null
  const messages = cleanHistory(body?.messages)
  if (!messages) return NextResponse.json({ error: "That message couldn't be read." }, { status: 400 })
  const claimed = cleanContext(body?.context)

  const openai = client()
  if (!openai || !assistantConfigured(process.env)) return NextResponse.json({ error: "The assistant isn't available right now." }, { status: 503 })

  const now = new Date()
  const today = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "long", month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(now)
  const lastQuestion = messages[messages.length - 1]!.content
  const webOn = webSearchEnabled(process.env) && needsWeb(lastQuestion) && webSearchesLeft(userId) > 0
  const toolsWithWeb = [...TOOL_DEFS, { type: "web_search" }]
  const tools = webOn ? toolsWithWeb : TOOL_DEFS
  // Anything that may involve numbers gets some reasoning; only greetings and thanks skip it. (Hosted web search isn't offered at minimal effort.)
  const effort = webOn || !isSmallTalk(lastQuestion) ? "low" : "minimal"

  const [brief, { context, entityName }] = await Promise.all([
    loadPositions(userId).then((p) => portfolioBrief(p, 5, !webOn)).catch(() => ""),
    // The league named by the browser is checked against the person's memberships before the model hears of it.
    verifyPageEntity(userId, claimed),
  ])
  const instructions = buildInstructions({ today, marketOpen: isUsMarketOpen(now), context, entityName, brief })
  const input: Item[] = compactHistory(messages.map((m) => (m.role === "assistant" ? { ...m, content: withoutFollowUps(m.content) } : m))).map((m) => ({ role: m.role, content: m.content }))

  const inputBytes = tokenBound(instructions) + tokenBound(JSON.stringify(input)) + tokenBound(JSON.stringify(tools))
  if (inputBytes > LIMITS.maxInputTokens) return NextResponse.json({ error: "That conversation is too long. Start a new one." }, { status: 413 })

  const reserved = worstCaseUsd(inputBytes) + (webOn ? WEB_SEARCH_USD : 0)
  const { decision, id: reservation } = await reserve(userId, ASSISTANT_MODEL, reserved)
  if (!decision.ok || !reservation) {
    return NextResponse.json({ error: decision.ok ? "Try again shortly." : decision.message, reason: decision.ok ? undefined : decision.reason }, { status: 429 })
  }

  const encoder = new TextEncoder()
  const used = { inputTokens: 0, outputTokens: 0, webSearches: 0 }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true
      const send = (event: AssistantEvent) => {
        if (open) controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`))
      }
      request.signal.addEventListener("abort", () => {
        open = false
      })

      try {
        send({ type: "status", stage: "reading" })
        for (let round = 0; round < LIMITS.maxToolRounds; round++) {
          if (!open) break
          const events = await openai.responses.create(
            {
              model: ASSISTANT_MODEL,
              instructions,
              input: input as never,
              // One search per request: once it has run, later rounds don't offer it again.
              tools: (webOn && used.webSearches === 0 ? toolsWithWeb : TOOL_DEFS) as never,
              ...(webOn && used.webSearches === 0 ? { max_tool_calls: 1 } : {}),
              reasoning: { effort },
              // Short answers are the product: ask for low verbosity where the model supports the setting.
              ...(ASSISTANT_MODEL.startsWith("gpt-5") ? { text: { verbosity: "low" } } : {}),
              max_output_tokens: LIMITS.maxOutputTokens,
              store: false,
              prompt_cache_key: "pf-assistant",
              include: ["reasoning.encrypted_content"],
              stream: true,
            },
            { signal: request.signal },
          )

          const calls: { call_id: string; name: string; arguments: string }[] = []
          let produced: Item[] = []
          let writing = false
          for await (const event of events) {
            if (event.type === "response.output_text.delta") {
              if (!writing) {
                writing = true
                send({ type: "status", stage: "writing" })
              }
              send({ type: "text", delta: event.delta })
            } else if (event.type === "response.output_item.added" && (event.item as { type?: string }).type === "web_search_call") {
              send({ type: "status", stage: "analyzing", label: "Searching the web" })
            } else if (event.type === "response.completed") {
              produced = event.response.output as unknown as Item[]
              used.inputTokens += event.response.usage?.input_tokens ?? 0
              used.outputTokens += event.response.usage?.output_tokens ?? 0
            } else if (event.type === "response.incomplete" || event.type === "response.failed") {
              throw new Error("The model didn't finish.")
            }
          }

          for (const item of produced) {
            if (item.type === "web_search_call") {
              used.webSearches++
              webUse.set(userId, [...(webUse.get(userId) ?? []), Date.now()])
            }
            if (item.type === "message") {
              // Web search citations become source chips, and make those addresses linkable.
              const cites: Source[] = []
              for (const part of ((item as { content?: unknown[] }).content ?? []) as { annotations?: { type?: string; url?: string; title?: string }[] }[]) {
                for (const a of part.annotations ?? []) if (a.type === "url_citation" && typeof a.url === "string") cites.push({ url: a.url, title: a.title, cited: true })
              }
              if (cites.length > 0) send({ type: "sources", items: cites })
            }
            if (item.type === "function_call") calls.push(item as unknown as (typeof calls)[number])
          }
          if (calls.length === 0) break

          // Keep the model's own output (including reasoning) so it can continue after the tool results.
          input.push(...produced)
          for (const call of calls) {
            send({ type: "status", stage: "analyzing", label: toolLabel(call.name, call.arguments) })
            let output: unknown
            try {
              output = await runTool(call.name, call.arguments, { userId, page: context.page, range: context.range, pageLeagueId: context.page === "leagues" ? context.entityId : undefined, pageFantasyId: context.page === "fantasy" ? context.entityId : undefined, pageSportsId: context.page === "sports" ? context.entityId : undefined, emit: (e) => send(e) })
            } catch (error) {
              console.error("[assistant] tool failed", call.name, error instanceof Error ? error.message : error)
              output = { error: "That data isn't available right now." }
            }
            const serialized = JSON.stringify(output)
            // Addresses that came from the person's own data (news headlines) may be linked; nothing else may.
            const seen = collectUrls(serialized)
            if (seen.length > 0) send({ type: "sources", items: seen.map((url) => ({ url })) })
            input.push({ type: "function_call_output", call_id: call.call_id, output: serialized })
          }
        }
        send({ type: "done" })
      } catch (error) {
        if (open) {
          console.error("[assistant] request failed", error instanceof Error ? error.message : error)
          send({ type: "error", message: "The assistant couldn't finish that. Try again." })
        }
      } finally {
        try {
          // A request that never reported usage keeps its worst-case reservation as its cost.
          if (used.inputTokens > 0) {
            await settle(reservation, { inputTokens: used.inputTokens, outputTokens: used.outputTokens, costUsd: costOf(used.inputTokens, used.outputTokens) + used.webSearches * WEB_SEARCH_USD })
          }
        } catch (error) {
          console.error("[assistant] couldn't settle usage", error instanceof Error ? error.message : error)
        }
        if (open) controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store, no-transform", "X-Accel-Buffering": "no" },
  })
}
