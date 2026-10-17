import { chromium } from "playwright"
import fs from "node:fs"
const dir = process.env.SHOTS_DIR || "/tmp/assistant-shots"
const xray = JSON.parse(fs.readFileSync(`${import.meta.dirname}/fixtures/assistant-xray.json`, "utf8"))

const briefing = `**Mostly tech-driven, and NVIDIA is doing the heavy lifting.** It is **31%** of the portfolio on its own, so one bad week there moves your whole result.

- Top 3 holdings are about 63% of the total
- Tech is the only sector with real weight
- You are up on the period, but the gain is narrow

See [your portfolio](/dashboard) for the full picture, or [NVIDIA's investor page](https://investor.nvidia.com/home/default.aspx).

<follow_ups>
- Is NVIDIA too big a position?
- How do I compare with the S&P 500?
- What are my biggest risks?
</follow_ups>`

const second = `Here is a quick comparison:

| Holding | Weight | Today |
|---|--:|--:|
| NVDA | 31% | +1.0% |
| VTI | 22% | +0.4% |
| AAPL | 14% | -0.9% |

1. Trim concentration risk is a *general* idea, see https://www.investor.gov/introduction-investing/investing-basics, not advice.
2. Use \`get_holdings\` for detail.

\`\`\`
weight = value / total
\`\`\`

<follow_ups>
- Show sector breakdown
- Compare with QQQ
</follow_ups>`

function ndjson(events) {
  return events.map((e) => JSON.stringify(e)).join("\n") + "\n"
}

async function run(scheme, width, height, tag) {
  const browser = await chromium.launch({ executablePath: undefined })
  const ctx = await browser.newContext({ colorScheme: scheme, viewport: { width, height } })
  await ctx.addInitScript((s) => {
    try { localStorage.setItem("theme", s) } catch {}
  }, scheme)
  const page = await ctx.newPage()
  page.on("pageerror", (e) => console.log("PAGEERROR", e.message))
  page.on("console", (m) => { if (m.type() === "error") console.log("CONSOLE", m.text().slice(0, 200)) })
  let n = 0
  await page.route("**/api/assistant/status", (r) => r.fulfill({ json: { available: true } }))
  await page.route("**/api/assistant/scope", (r) => r.fulfill({ json: { linked: 2, manual: 0 } }))
  await page.route("**/api/assistant", async (r) => {
    n++
    const body = r.request().postDataJSON()
    console.log("REQUEST context", JSON.stringify(body.context), "msgs", body.messages.map((m) => m.content.slice(0, 40)))
    if (n === 1) {
      await r.fulfill({ status: 200, contentType: "application/x-ndjson", body: ndjson([{ type: "status", stage: "reading" }, { type: "status", stage: "analyzing", label: "Running the portfolio X-Ray" }, { type: "xray", data: xray }, { type: "status", stage: "writing" }, { type: "text", delta: briefing }, { type: "done" }]) })
    } else if (n === 2) {
      await r.fulfill({ status: 200, contentType: "application/x-ndjson", body: ndjson([{ type: "status", stage: "writing" }, { type: "text", delta: second }, { type: "done" }]) })
    } else {
      await r.fulfill({ status: 503, json: { error: "The assistant isn't available right now." } })
    }
  })
  await page.goto("http://localhost:3111/preview/assistant-harness?live=1", { waitUntil: "networkidle" })
  await page.waitForSelector(".pf-ai-launch")
  await page.click(".pf-ai-launch")
  await page.waitForSelector(".pf-ai-empty")
  await page.waitForTimeout(900)
  await page.screenshot({ path: `${dir}/${tag}-1-empty.png` })
  await page.click("text=Analyze my portfolio")
  await page.waitForTimeout(700)
  await page.screenshot({ path: `${dir}/${tag}-2-typing.png` })
  await page.waitForSelector(".pf-ai-next-chip", { timeout: 15000 })
  await page.waitForTimeout(900)
  await page.screenshot({ path: `${dir}/${tag}-3-briefing.png` })
  await page.click(".pf-x2-toggle")
  await page.waitForTimeout(700)
  await page.screenshot({ path: `${dir}/${tag}-4-details.png` })
  // link checks
  const links = await page.$$eval(".pf-ai-md a", (as) => as.map((a) => ({ text: a.textContent.trim(), href: a.getAttribute("href"), target: a.target, rel: a.rel, color: getComputedStyle(a).color, deco: getComputedStyle(a).textDecorationLine })))
  console.log(tag, "LINKS", JSON.stringify(links))
  // second question via chip
  await page.click(".pf-ai-next-chip >> nth=1")
  await page.waitForSelector(".pf-ai-md table", { timeout: 15000 })
  await page.waitForTimeout(1800)
  await page.screenshot({ path: `${dir}/${tag}-5-markdown.png` })
  // copy button
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]).catch(() => {})
  await page.click('button[aria-label="Copy answer"] >> nth=-1').catch((e) => console.log("copy click failed", e.message))
  await page.waitForTimeout(300)
  console.log(tag, "COPIED?", await page.locator(".pf-ai-act.is-done").count())
  // regenerate -> third request fails gracefully
  await page.click('button[aria-label="Regenerate answer"]')
  await page.waitForSelector(".pf-ai-err", { timeout: 8000 })
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${dir}/${tag}-6-error.png` })
  await browser.close()
}

;(async () => {
  await run("light", 1280, 900, "light")
  await run("dark", 1280, 900, "dark")
  await run("light", 390, 800, "phone")
})().catch((e) => { console.error(e); process.exit(1) })
