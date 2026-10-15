import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { parseStreamChunk } from "./stream-parse.ts"

const line = (o: unknown) => JSON.stringify(o) + "\n"

/** Feeds chunks through the parser the way the client does. */
function feed(chunks: string[]) {
  let buffer = ""
  const events: unknown[] = []
  for (const c of chunks) {
    const r = parseStreamChunk(buffer, c)
    buffer = r.rest
    events.push(...r.events)
  }
  return { events, rest: buffer }
}

describe("parseStreamChunk", () => {
  it("parses several events in one chunk", () => {
    const { events, rest } = feed([line({ type: "status", stage: "reading" }) + line({ type: "text", delta: "Hi" }) + line({ type: "done" })])
    assert.deepEqual(events, [{ type: "status", stage: "reading" }, { type: "text", delta: "Hi" }, { type: "done" }])
    assert.equal(rest, "")
  })

  it("holds a partial line until its newline arrives", () => {
    const whole = line({ type: "text", delta: "hello world" })
    const r1 = parseStreamChunk("", whole.slice(0, 10))
    assert.deepEqual(r1.events, [])
    assert.equal(r1.rest, whole.slice(0, 10))
    const r2 = parseStreamChunk(r1.rest, whole.slice(10))
    assert.deepEqual(r2.events, [{ type: "text", delta: "hello world" }])
    assert.equal(r2.rest, "")
  })

  it("gives the same events however the stream is cut, byte by byte included", () => {
    const stream = line({ type: "status", stage: "analyzing" }) + line({ type: "text", delta: "a\nb" }) + line({ type: "error", message: "x" })
    const expected = feed([stream]).events
    for (let cut = 0; cut <= stream.length; cut++) assert.deepEqual(feed([stream.slice(0, cut), stream.slice(cut)]).events, expected, `cut ${cut}`)
    assert.deepEqual(feed([...stream].map((c) => c)).events, expected)
  })

  it("keeps newlines inside text deltas (they are escaped in the JSON)", () => {
    assert.deepEqual(feed([line({ type: "text", delta: "line1\nline2" })]).events, [{ type: "text", delta: "line1\nline2" }])
  })

  it("skips blank, whitespace-only and malformed lines but keeps good ones around them", () => {
    const { events } = feed(["\n", "   \n", "not json\n", '{"type":"text","delta":"a"\n', line({ type: "text", delta: "ok" }), "{{{\n", line({ type: "done" })])
    assert.deepEqual(events, [{ type: "text", delta: "ok" }, { type: "done" }])
  })

  it("skips valid JSON that isn't an event", () => {
    const { events } = feed(["null\n", "42\n", '"text"\n', "[1,2]\n", "{}\n", '{"type":5}\n', line({ type: "done" })])
    assert.deepEqual(events, [{ type: "done" }])
  })

  it("does not emit an unterminated final line", () => {
    const r = parseStreamChunk("", line({ type: "done" }) + '{"type":"text","delta":"cut')
    assert.equal(r.events.length, 1)
    assert.equal(r.rest, '{"type":"text","delta":"cut')
  })

  it("handles unicode, including emoji and CJK", () => {
    const { events } = feed([line({ type: "text", delta: "naïve café 日本語 🚀 ₿" })])
    assert.deepEqual(events, [{ type: "text", delta: "naïve café 日本語 🚀 ₿" }])
  })

  it("decodes multi-byte characters split across network chunks when streamed through TextDecoder", () => {
    const bytes = new TextEncoder().encode(line({ type: "text", delta: "🚀 rocket" }))
    const decoder = new TextDecoder()
    const chunks = [bytes.slice(0, 5), bytes.slice(5, 7), bytes.slice(7)].map((b) => decoder.decode(b, { stream: true }))
    assert.deepEqual(feed(chunks).events, [{ type: "text", delta: "🚀 rocket" }])
  })

  it("handles CRLF line endings", () => {
    assert.deepEqual(feed(['{"type":"done"}\r\n']).events, [{ type: "done" }])
  })

  it("passes through an unknown event type for the caller to ignore", () => {
    assert.deepEqual(feed([line({ type: "link", href: "/x" })]).events, [{ type: "link", href: "/x" }])
  })
})
