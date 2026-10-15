import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { TOOL_DEFS } from "./tool-defs.ts"

type Schema = { type?: unknown; properties?: Record<string, Schema>; required?: string[]; additionalProperties?: unknown; items?: Schema }

/** Strict mode applies to every nested object, not just the top one. */
function checkStrict(name: string, s: Schema, path = "parameters") {
  if (s.type === "object" || (Array.isArray(s.type) && s.type.includes("object"))) {
    assert.equal(s.additionalProperties, false, `${name}.${path} needs additionalProperties:false`)
    const props = Object.keys(s.properties ?? {})
    assert.deepEqual([...(s.required ?? [])].sort(), props.sort(), `${name}.${path}: every property must be required`)
    for (const [k, v] of Object.entries(s.properties ?? {})) checkStrict(name, v, `${path}.${k}`)
  }
  if (s.items) checkStrict(name, s.items, `${path}[]`)
}

describe("TOOL_DEFS", () => {
  it("has unique names, descriptions and strict function shape", () => {
    const names = TOOL_DEFS.map((t) => t.name)
    assert.equal(new Set(names).size, names.length)
    for (const t of TOOL_DEFS) {
      assert.equal(t.type, "function")
      assert.equal(t.strict, true)
      assert.match(t.name, /^[a-z][a-z0-9_]*$/)
      assert.ok(t.description.length > 20, t.name)
    }
  })

  it("is strict-compatible: additionalProperties:false and every property required", () => {
    for (const t of TOOL_DEFS) {
      assert.equal((t.parameters as Schema).type, "object", t.name)
      checkStrict(t.name, t.parameters as Schema)
    }
  })

  it("exposes no argument that could name a user", () => {
    for (const t of TOOL_DEFS) {
      const keys = Object.keys(((t.parameters as Schema).properties ?? {}))
      for (const k of keys) assert.doesNotMatch(k, /user|owner|member|email|account/i, `${t.name}.${k}`)
    }
  })

  it("every tool is handled by a case in runTool (and nothing is handled without a def)", () => {
    const src = readFileSync(new URL("./tools.ts", import.meta.url), "utf8")
    const cases = [...src.matchAll(/^\s*case "([a-z0-9_]+)":/gm)].map((x) => x[1]!)
    for (const t of TOOL_DEFS) assert.ok(cases.includes(t.name), `runTool has no case for ${t.name}`)
    for (const c of cases) assert.ok(TOOL_DEFS.some((t) => t.name === c), `case "${c}" has no TOOL_DEFS entry`)
  })

  it("tools.ts re-exports these definitions rather than keeping its own copy", () => {
    const src = readFileSync(new URL("./tools.ts", import.meta.url), "utf8")
    assert.match(src, /export \{ TOOL_DEFS.*\} from "@web\/lib\/ai\/tool-defs"/)
  })
})
