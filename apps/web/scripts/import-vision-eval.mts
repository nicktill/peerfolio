// Runs the screenshot fixtures through the real vision reader and prints accuracy.
//   OPENAI_API_KEY=... [IMPORT_AI_MODEL=gpt-5.4-mini] node --experimental-strip-types scripts/import-vision-eval.mts
import { readFileSync, readdirSync } from "node:fs"
import OpenAI from "openai"
import { importModel, parseWithAi } from "../src/lib/import-ai.ts"

const dir = new URL("../test-fixtures/import-screenshots/", import.meta.url)
const expected = JSON.parse(readFileSync(new URL("expected.json", dir), "utf8")) as Record<string, [string, number, number | null][]>

if (!process.env.OPENAI_API_KEY) {
  console.log("OPENAI_API_KEY is not set; skipping the real vision run.")
  process.exit(0)
}
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 0, timeout: 60_000 })
const near = (a: number | null, b: number | null) => (a == null || b == null ? a === b : Math.abs(a - b) <= 0.005 * Math.max(1, Math.abs(b)))

console.log(`model: ${importModel()}`)
for (const file of readdirSync(dir).filter((f) => f.endsWith(".png"))) {
  const key = file.replace(".png", "")
  const started = Date.now()
  try {
    const out = await parseWithAi("", { client, image: { mediaType: "image/png", data: readFileSync(new URL(file, dir)).toString("base64") } })
    const want = expected[key] ?? []
    const right = want.filter(([s, q, a]) => out.rows.find((r) => r.symbol === s && near(r.quantity, q) && (a == null || near(r.avgCost, a)))).length
    console.log(`${key.padEnd(22)} ${right}/${want.length} correct, ${out.rows.length - right} extra/wrong, ${out.rows.filter((r) => r.flag).length} flagged, ${((Date.now() - started) / 1000).toFixed(1)}s`)
  } catch (e) {
    console.log(`${key.padEnd(22)} failed: ${e instanceof Error ? e.message : e}`)
  }
}
