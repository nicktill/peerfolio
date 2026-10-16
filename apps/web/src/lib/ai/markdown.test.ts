import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { classifyHref, parseInline, parseMarkdown, settleForStreaming, splitSigned, trimUrl, type Inline } from "./markdown.ts"

const links = (nodes: Inline[]): Extract<Inline, { t: "link" }>[] => {
  const out: Extract<Inline, { t: "link" }>[] = []
  for (const n of nodes) {
    if (n.t === "link") out.push(n)
    if ("c" in n) out.push(...links(n.c))
  }
  return out
}

describe("classifyHref", () => {
  it("opens web links externally", () => {
    assert.deepEqual(classifyHref("https://example.com/a?b=1#c"), { href: "https://example.com/a?b=1#c", kind: "external" })
    assert.deepEqual(classifyHref("http://example.com"), { href: "http://example.com/", kind: "external" })
    assert.equal(classifyHref("www.example.com")?.href, "https://www.example.com/")
    assert.equal(classifyHref("//example.com/x")?.kind, "external")
  })

  it("keeps links into the app internal", () => {
    assert.deepEqual(classifyHref("/dashboard"), { href: "/dashboard", kind: "internal" })
    assert.deepEqual(classifyHref("/leagues/abc?range=1M#top"), { href: "/leagues/abc?range=1M#top", kind: "internal" })
    assert.deepEqual(classifyHref("https://peerfolio.app/news", "https://peerfolio.app"), { href: "/news", kind: "internal" })
    // A different origin stays external even with the same path.
    assert.equal(classifyHref("https://evil.example/news", "https://peerfolio.app")?.kind, "external")
  })

  it("refuses links that are unsafe or would not go anywhere", () => {
    for (const bad of ["javascript:alert(1)", "JaVaScRiPt:alert(1)", "data:text/html,hi", "vbscript:x", "file:///etc/passwd", "/unknown/page", "/\\evil.com", "https://user:pw@example.com", "", "   ", "https://exa\nmple.com", "ftp://example.com"]) {
      assert.equal(classifyHref(bad), null, bad)
    }
  })

  it("allows mailto", () => {
    assert.equal(classifyHref("mailto:hi@example.com")?.kind, "mail")
  })
})

describe("trimUrl", () => {
  it("drops sentence punctuation but keeps balanced brackets", () => {
    assert.equal(trimUrl("https://a.com/x."), "https://a.com/x")
    assert.equal(trimUrl("https://a.com/x),"), "https://a.com/x")
    assert.equal(trimUrl("https://en.wikipedia.org/wiki/Foo_(bar)"), "https://en.wikipedia.org/wiki/Foo_(bar)")
    assert.equal(trimUrl("https://a.com/?q=1!?"), "https://a.com/?q=1")
  })
})

describe("parseInline links", () => {
  it("reads [label](url)", () => {
    const [l] = links(parseInline("See [the docs](https://example.com/docs) now"))
    assert.equal(l!.href, "https://example.com/docs")
    assert.equal(l!.kind, "external")
    assert.deepEqual(l!.c, [{ t: "text", v: "the docs" }])
  })

  it("turns a bare URL into a link and leaves the full stop out", () => {
    const nodes = parseInline("Read https://example.com/post. Then www.example.org/a, ok")
    const found = links(nodes)
    assert.deepEqual(found.map((l) => l.href), ["https://example.com/post", "https://www.example.org/a"])
    assert.equal(nodes.find((n) => n.t === "text" && n.v.startsWith("."))?.t, "text")
  })

  it("reads <url>", () => {
    assert.equal(links(parseInline("<https://example.com>"))[0]!.href, "https://example.com/")
  })

  it("links an internal path as internal", () => {
    const [l] = links(parseInline("[Open it](/wealth?x=1)"))
    assert.deepEqual([l!.href, l!.kind], ["/wealth?x=1", "internal"])
  })

  it("keeps the words but no link when the target is unsafe", () => {
    const nodes = parseInline("[click me](javascript:alert(1))")
    assert.equal(links(nodes).length, 0)
    assert.deepEqual(nodes, [{ t: "text", v: "click me" }])
  })

  it("does not link inside code", () => {
    assert.equal(links(parseInline("`https://example.com`")).length, 0)
  })

  it("formats a link's label", () => {
    const [l] = links(parseInline("[**bold** label](https://example.com)"))
    assert.equal(l!.c[0]!.t, "strong")
  })

  it("does not treat words that merely end in h or w as URLs", () => {
    assert.equal(links(parseInline("growth http, www")).length, 0)
  })
})

describe("parseInline formatting", () => {
  it("handles bold, italic, strike and code", () => {
    const nodes = parseInline("**a** *b* ~~c~~ `d`")
    assert.deepEqual(nodes.filter((n) => n.t !== "text").map((n) => n.t), ["strong", "em", "del", "code"])
  })

  it("leaves snake_case and lone asterisks alone", () => {
    assert.deepEqual(parseInline("my_var_name and 2 * 3"), [{ t: "text", v: "my_var_name and 2 * 3" }])
  })

  it("leaves unclosed markers as written", () => {
    assert.deepEqual(parseInline("**oops"), [{ t: "text", v: "**oops" }])
  })

  it("supports escapes", () => {
    assert.deepEqual(parseInline("\\*not bold\\*"), [{ t: "text", v: "*not bold*" }])
  })
})

describe("parseMarkdown blocks", () => {
  it("separates paragraphs and headings", () => {
    const b = parseMarkdown("## Verdict\n\nFirst.\n\nSecond.")
    assert.deepEqual(b.map((x) => x.t), ["h", "p", "p"])
  })

  it("reads bullet and numbered lists", () => {
    const [ul, ol] = parseMarkdown("- one\n- two\n\n1. a\n2. b\n3. c")
    assert.equal(ul!.t === "list" && ul!.ordered, false)
    assert.equal(ul!.t === "list" && ul!.items.length, 2)
    assert.equal(ol!.t === "list" && ol!.ordered, true)
    assert.equal(ol!.t === "list" && ol!.items.length, 3)
  })

  it("nests an indented list inside its item", () => {
    const [list] = parseMarkdown("- parent\n  - child one\n  - child two\n- next")
    assert.ok(list && list.t === "list")
    assert.equal(list.items.length, 2)
    assert.deepEqual(list.items[0]!.map((b) => b.t), ["p", "list"])
  })

  it("reads a fenced code block, even when it is unfinished", () => {
    const [done] = parseMarkdown("```ts\nconst a = 1\n```")
    assert.deepEqual(done, { t: "code", lang: "ts", v: "const a = 1" })
    const [open] = parseMarkdown("```\nstill typing")
    assert.deepEqual(open, { t: "code", lang: "", v: "still typing" })
  })

  it("reads a table with alignment", () => {
    const [t] = parseMarkdown("| Name | Weight |\n|:--|--:|\n| AAPL | 12% |\n| MSFT | 8% |")
    assert.ok(t && t.t === "table")
    assert.deepEqual(t.align, ["left", "right"])
    assert.equal(t.head.length, 2)
    assert.equal(t.rows.length, 2)
  })

  it("reads quotes and rules", () => {
    const b = parseMarkdown("> note\n\n---\n\nafter")
    assert.deepEqual(b.map((x) => x.t), ["quote", "hr", "p"])
  })

  it("keeps line breaks inside a paragraph", () => {
    const [p] = parseMarkdown("line one\nline two")
    assert.ok(p && p.t === "p")
    assert.ok(p.c.some((n) => n.t === "br"))
  })

  it("never produces raw HTML: markup stays as text", () => {
    const [p] = parseMarkdown("<script>alert(1)</script> <img src=x onerror=alert(1)>")
    assert.ok(p && p.t === "p")
    assert.ok(p.c.every((n) => n.t === "text"))
  })

  it("is not thrown by odd input", () => {
    for (const s of ["", "\n\n", "[", "[]()", "[a](", "](", "**", "```", "|", "| a |\n|---|", "- ", "1.", ">", "#", "* * *", "[[[a]]]((b))"]) {
      assert.doesNotThrow(() => parseMarkdown(s), s)
    }
  })
})

describe("splitSigned", () => {
  const tones = (s: string) => splitSigned(s).filter((p) => p.tone).map((p) => `${p.v}:${p.tone}`)
  it("tints signed percentages and money", () => {
    assert.deepEqual(tones("NVDA +1.2% today, AAPL −0.9%, down -$340 overall"), ["+1.2%:up", "−0.9%:down", "-$340:down"])
  })
  it("leaves ranges, dates, plain numbers and unsigned figures alone", () => {
    assert.deepEqual(tones("Between 5-10% in 2025-10-15, up 3 points, 12% of the total, +4 holdings"), [])
  })
  it("keeps the text intact", () => {
    const s = "Up +2.5% and down -1%."
    assert.equal(splitSigned(s).map((p) => p.v).join(""), s)
  })
})

describe("settleForStreaming", () => {
  it("closes an open fence, bold and code span", () => {
    assert.equal(settleForStreaming("```\ncode"), "```\ncode\n```")
    assert.equal(settleForStreaming("This is **bold"), "This is **bold**")
    assert.equal(settleForStreaming("Use `x"), "Use `x`")
  })

  it("shows only the label of a half-written link", () => {
    assert.equal(settleForStreaming("See [the docs](https://exa"), "See the docs")
    assert.equal(settleForStreaming("See [the do"), "See the do")
  })

  it("leaves finished text alone", () => {
    const done = "A **bold** [link](https://example.com) and `code`."
    assert.equal(settleForStreaming(done), done)
  })
})
