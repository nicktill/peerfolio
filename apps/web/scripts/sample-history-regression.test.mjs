import test from "node:test"
import assert from "node:assert/strict"
import { build } from "esbuild"
import { runInNewContext } from "node:vm"
import { fileURLToPath } from "node:url"

// Exercise the real fixture dispatcher, including its browser demo-mode guard.
const bundle = await build({ entryPoints: [fileURLToPath(new URL("../src/lib/sample/fixtures.ts", import.meta.url))], bundle: true, write: false, format: "iife", globalName: "fixtures", platform: "browser", tsconfig: fileURLToPath(new URL("../tsconfig.json", import.meta.url)) })
function fixture(pathname, mode = "real") {
  const context = { URLSearchParams, window: { location: { pathname, search: "" } }, localStorage: { getItem: () => mode } }
  runInNewContext(bundle.outputFiles[0].text, context)
  return context.fixtures.sampleResponse("/api/sports/live/history?eventId=55555555-5555-4555-8555-555555555555&source=polymarket", pathname)
}
test("real league history must reach the API, never return the demo sine wave", () => {
  assert.equal(fixture("/fantasy/sports/real-league"), null)
  assert.equal(fixture("/fantasy/sports/market"), null)
  assert.equal(fixture("/fantasy/sports/real-league", "empty"), null)
})
test("sample views and explicit sample mode retain their illustrative history", () => {
  assert.equal(fixture("/preview/sports/sample").series.length, 60)
  assert.equal(fixture("/fantasy/sports/real-league", "sample").series.length, 60)
})
