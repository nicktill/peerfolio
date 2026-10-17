/**
 * A small, safe Markdown reader for assistant replies. It produces a plain data tree (never HTML), which the
 * chat window turns into React elements, so nothing the model writes can inject markup. It covers what chat
 * answers actually use: paragraphs, headings, bold/italic/strike, inline code, fenced code, bullet and numbered
 * lists, quotes, tables, rules and links (written as [label](url), as <url>, or as a bare URL).
 *
 * Links are classified by {@link classifyHref}: web links open in a new tab, app links navigate in place, and
 * anything else (javascript:, data:, an unknown app path) is dropped to plain text.
 */

export type Inline =
  | { t: "text"; v: string }
  | { t: "code"; v: string }
  | { t: "strong"; c: Inline[] }
  | { t: "em"; c: Inline[] }
  | { t: "del"; c: Inline[] }
  | { t: "link"; href: string; kind: "external" | "internal" | "mail"; c: Inline[] }
  | { t: "br" }

export type Align = "left" | "center" | "right" | null

export type Block =
  | { t: "p"; c: Inline[] }
  | { t: "h"; level: 1 | 2 | 3; c: Inline[] }
  | { t: "list"; ordered: boolean; start: number; items: Block[][] }
  | { t: "quote"; c: Block[] }
  | { t: "code"; lang: string; v: string }
  | { t: "hr" }
  | { t: "table"; align: Align[]; head: Inline[][]; rows: Inline[][][] }

/** Where in the app a link may point. Anything else would be a dead link, so it is shown as text. */
const APP_PATHS = ["/dashboard", "/leagues", "/fantasy", "/news", "/board", "/wealth", "/settings"]

export type Href = { href: string; kind: "external" | "internal" | "mail" }

/**
 * Decides what a link may do. `origin` is the app's own origin (so an absolute link back to Peerfolio becomes an
 * in-app navigation); pass it from the browser, or leave it out on the server.
 */
export function classifyHref(raw: string, origin?: string): Href | null {
  const value = raw.trim()
  if (!value || /[\u0000-\u001f\u007f]/.test(value) || value.length > 2000) return null

  if (/^mailto:[^\s@]+@[^\s@]+$/i.test(value)) return { href: value, kind: "mail" }

  // Same-origin path: "/dashboard", "/leagues/abc?x=1#y". Not "//host" and not a backslash trick.
  if (value.startsWith("/") && !value.startsWith("//") && !value.includes("\\")) {
    const path = value.split(/[?#]/)[0]!
    return APP_PATHS.some((p) => path === p || path.startsWith(`${p}/`)) ? { href: value, kind: "internal" } : null
  }

  let url: URL
  try {
    url = new URL(value.startsWith("//") ? `https:${value}` : /^www\./i.test(value) ? `https://${value}` : value)
  } catch {
    return null
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null
  if (url.username || url.password) return null
  if (origin && url.origin === origin) return classifyHref(`${url.pathname}${url.search}${url.hash}`)
  return { href: url.href, kind: "external" }
}

// ---------------------------------------------------------------------------------------------------------------
// Inline

const PUNCT_END = /[.,;:!?'"”’»]/

/** Trims sentence punctuation (and an unmatched closing bracket) off the end of a bare URL. */
export function trimUrl(url: string): string {
  let end = url.length
  for (;;) {
    const ch = url[end - 1]
    if (end === 0 || ch === undefined) break
    if (PUNCT_END.test(ch)) end--
    else if (ch === ")" || ch === "]") {
      const open = ch === ")" ? "(" : "["
      const body = url.slice(0, end)
      const opens = body.split(open).length - 1
      const closes = body.split(ch).length - 1
      if (closes > opens) end--
      else break
    } else break
  }
  return url.slice(0, end)
}

const BARE_URL = /^(?:https?:\/\/|www\.)[^\s<>]+/i

function pushText(out: Inline[], v: string) {
  if (!v) return
  const last = out[out.length - 1]
  if (last && last.t === "text") last.v += v
  else out.push({ t: "text", v })
}

/** Index of the `]` that closes the `[` at `open`, allowing nested brackets; -1 when there is none. */
function matchBracket(s: string, open: number): number {
  let depth = 0
  for (let i = open; i < s.length; i++) {
    const ch = s[i]
    if (ch === "\\") i++
    else if (ch === "[") depth++
    else if (ch === "]" && --depth === 0) return i
    else if (ch === "\n" && s[i + 1] === "\n") return -1
  }
  return -1
}

/** Reads `(url "title")` starting at the `(`; returns the url and the index after the `)`. */
function readDestination(s: string, open: number): { url: string; end: number } | null {
  let depth = 0
  for (let i = open; i < s.length; i++) {
    const ch = s[i]
    if (ch === "\\") i++
    else if (ch === "(") depth++
    else if (ch === ")" && --depth === 0) {
      const inner = s.slice(open + 1, i).trim()
      const url = inner.startsWith("<") && inner.includes(">") ? inner.slice(1, inner.indexOf(">")) : inner.split(/\s+/)[0]!
      return { url, end: i + 1 }
    } else if (ch === "\n") return null
  }
  return null
}

/** Finds a closing delimiter that is not preceded by whitespace. */
function findClose(s: string, from: number, delim: string): number {
  for (let i = from; i <= s.length - delim.length; i++) {
    if (s[i] === "\\") {
      i++
      continue
    }
    if (s.startsWith(delim, i) && i > from && !/\s/.test(s[i - 1]!)) {
      // A single * or _ must not be half of a double one.
      if (delim.length === 1 && (s[i + 1] === delim || s[i - 1] === delim)) continue
      return i
    }
  }
  return -1
}

const isWordChar = (ch: string | undefined) => !!ch && /[\p{L}\p{N}]/u.test(ch)

export function parseInline(s: string, origin?: string): Inline[] {
  const out: Inline[] = []
  let i = 0
  while (i < s.length) {
    const ch = s[i]!

    if (ch === "\\" && i + 1 < s.length && /[\\`*_{}[\]()#+\-.!|~<>]/.test(s[i + 1]!)) {
      pushText(out, s[i + 1]!)
      i += 2
      continue
    }

    if (ch === "\n") {
      out.push({ t: "br" })
      i++
      continue
    }

    if (ch === "`") {
      const ticks = /^`+/.exec(s.slice(i))![0]
      const close = s.indexOf(ticks, i + ticks.length)
      if (close > i + ticks.length) {
        out.push({ t: "code", v: s.slice(i + ticks.length, close).replace(/^ (.*) $/, "$1") })
        i = close + ticks.length
        continue
      }
      pushText(out, ticks)
      i += ticks.length
      continue
    }

    if (ch === "[") {
      const close = matchBracket(s, i)
      if (close > i && s[close + 1] === "(") {
        const dest = readDestination(s, close + 1)
        if (dest) {
          const label = s.slice(i + 1, close)
          const target = classifyHref(dest.url, origin)
          if (target) {
            const inner = parseInline(label, origin).filter((n) => n.t !== "link")
            out.push({ t: "link", ...target, c: inner.length > 0 ? inner : [{ t: "text", v: dest.url }] })
          } else {
            // A link the app won't follow: keep the words, drop the target.
            for (const n of parseInline(label, origin)) out.push(n)
          }
          i = dest.end
          continue
        }
      }
      pushText(out, "[")
      i++
      continue
    }

    if (ch === "<") {
      const m = /^<((?:https?:\/\/|mailto:)[^\s<>]+)>/i.exec(s.slice(i))
      if (m) {
        const target = classifyHref(m[1]!, origin)
        if (target) out.push({ t: "link", ...target, c: [{ t: "text", v: m[1]! }] })
        else pushText(out, m[1]!)
        i += m[0].length
        continue
      }
    }

    if ((ch === "h" || ch === "H" || ch === "w" || ch === "W") && !isWordChar(s[i - 1])) {
      const m = BARE_URL.exec(s.slice(i))
      if (m) {
        const url = trimUrl(m[0])
        const target = url.length > 8 ? classifyHref(url, origin) : null
        if (target) {
          out.push({ t: "link", ...target, c: [{ t: "text", v: url }] })
          i += url.length
          continue
        }
      }
    }

    if (ch === "*" || ch === "_" || ch === "~") {
      const double = s[i + 1] === ch
      const delim = ch === "~" ? (double ? "~~" : "") : double ? ch + ch : ch
      const after = s[i + delim.length]
      // "_" only opens at a word edge, so snake_case and 2_000 stay as written.
      const canOpen = delim !== "" && after !== undefined && !/\s/.test(after) && (ch !== "_" || !isWordChar(s[i - 1]))
      if (canOpen) {
        const close = findClose(s, i + delim.length, delim)
        const edgeOk = close > 0 && (ch !== "_" || !isWordChar(s[close + delim.length]))
        if (close > 0 && edgeOk) {
          const c = parseInline(s.slice(i + delim.length, close), origin)
          out.push({ t: ch === "~" ? "del" : delim.length === 2 ? "strong" : "em", c })
          i = close + delim.length
          continue
        }
      }
    }

    pushText(out, ch)
    i++
  }
  return out
}

// ---------------------------------------------------------------------------------------------------------------
// Blocks

const FENCE = /^ {0,3}(`{3,}|~{3,})\s*([^\s`]*)[^`]*$/
const HEADING = /^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/
const HR = /^ {0,3}([-*_])(?:\s*\1){2,}\s*$/
const BULLET = /^(\s*)([-*+•])\s+(.*)$/
const ORDERED = /^(\s*)(\d{1,9})[.)]\s+(.*)$/
const QUOTE = /^ {0,3}>\s?(.*)$/

const splitRow = (line: string): string[] => {
  let t = line.trim()
  if (t.startsWith("|")) t = t.slice(1)
  if (t.endsWith("|") && !t.endsWith("\\|")) t = t.slice(0, -1)
  const cells: string[] = []
  let cur = ""
  for (let i = 0; i < t.length; i++) {
    if (t[i] === "\\" && t[i + 1] === "|") {
      cur += "|"
      i++
    } else if (t[i] === "|") {
      cells.push(cur.trim())
      cur = ""
    } else cur += t[i]
  }
  cells.push(cur.trim())
  return cells
}

const isDivider = (line: string) => {
  if (!line.includes("-")) return false
  const cells = splitRow(line)
  return cells.length > 0 && cells.every((c) => /^:?-{1,}:?$/.test(c))
}

const alignOf = (cell: string): Align => (cell.startsWith(":") && cell.endsWith(":") ? "center" : cell.endsWith(":") ? "right" : cell.startsWith(":") ? "left" : null)

const indentOf = (line: string) => /^\s*/.exec(line.replace(/\t/g, "    "))![0].length

/** Starts of a block that interrupts a paragraph. */
const startsBlock = (line: string, next?: string) =>
  FENCE.test(line) || HEADING.test(line) || HR.test(line) || QUOTE.test(line) || BULLET.test(line) || ORDERED.test(line) || (line.includes("|") && next !== undefined && isDivider(next) && !isDivider(line))

export function parseMarkdown(text: string, origin?: string): Block[] {
  const lines = text.replace(/\r\n?/g, "\n").replace(/\t/g, "    ").split("\n")
  return parseBlocks(lines, origin)
}

function parseBlocks(lines: string[], origin?: string): Block[] {
  const blocks: Block[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]!
    if (!line.trim()) {
      i++
      continue
    }

    const fence = FENCE.exec(line)
    if (fence) {
      const mark = fence[1]!
      const body: string[] = []
      i++
      // An unfinished fence (the reply is still streaming) runs to the end of the text.
      while (i < lines.length && !new RegExp(`^ {0,3}${mark[0] === "`" ? "`" : "~"}{${mark.length},}\\s*$`).test(lines[i]!)) body.push(lines[i++]!)
      i++
      blocks.push({ t: "code", lang: fence[2]!.slice(0, 20), v: body.join("\n") })
      continue
    }

    const heading = HEADING.exec(line)
    if (heading) {
      blocks.push({ t: "h", level: Math.min(3, heading[1]!.length) as 1 | 2 | 3, c: parseInline(heading[2]!, origin) })
      i++
      continue
    }

    if (HR.test(line)) {
      blocks.push({ t: "hr" })
      i++
      continue
    }

    if (QUOTE.test(line)) {
      const inner: string[] = []
      while (i < lines.length && QUOTE.test(lines[i]!)) {
        inner.push(QUOTE.exec(lines[i]!)![1]!)
        i++
      }
      blocks.push({ t: "quote", c: parseBlocks(inner, origin) })
      continue
    }

    if (line.includes("|") && i + 1 < lines.length && isDivider(lines[i + 1]!) && !isDivider(line)) {
      const head = splitRow(line)
      const aligns = splitRow(lines[i + 1]!).map(alignOf)
      i += 2
      const rows: Inline[][][] = []
      while (i < lines.length && lines[i]!.trim() && lines[i]!.includes("|")) {
        const cells = splitRow(lines[i]!)
        rows.push(head.map((_, k) => parseInline(cells[k] ?? "", origin)))
        i++
      }
      blocks.push({ t: "table", align: head.map((_, k) => aligns[k] ?? null), head: head.map((h) => parseInline(h, origin)), rows })
      continue
    }

    const marker = BULLET.exec(line) ?? ORDERED.exec(line)
    if (marker) {
      const ordered = ORDERED.test(line) && !BULLET.test(line)
      const baseIndent = indentOf(line)
      const start = ordered ? Number(ORDERED.exec(line)![2]) : 1
      const items: string[][] = []
      while (i < lines.length) {
        const cur = lines[i]!
        const m = (ordered ? ORDERED : BULLET).exec(cur)
        if (m && indentOf(cur) <= baseIndent + 1 && indentOf(cur) >= baseIndent) {
          items.push([m[3]!])
          i++
          continue
        }
        if (!items.length) break
        if (!cur.trim()) {
          // A blank line keeps the list going only when the next line is another item or an indented continuation.
          const next = lines[i + 1]
          if (next !== undefined && next.trim() && (indentOf(next) > baseIndent || ((ordered ? ORDERED : BULLET).test(next) && indentOf(next) === baseIndent))) {
            items[items.length - 1]!.push("")
            i++
            continue
          }
          break
        }
        if (indentOf(cur) > baseIndent) {
          items[items.length - 1]!.push(cur.slice(Math.min(indentOf(cur), baseIndent + 2)))
          i++
          continue
        }
        // A new block ends the list; plain text right under an item continues it.
        if (startsBlock(cur, lines[i + 1])) break
        items[items.length - 1]!.push(cur)
        i++
      }
      blocks.push({ t: "list", ordered, start, items: items.map((item) => parseBlocks(item, origin)) })
      continue
    }

    // Paragraph: runs until a blank line or the start of another block.
    const para: string[] = [line]
    i++
    while (i < lines.length && lines[i]!.trim() && !startsBlock(lines[i]!, lines[i + 1])) para.push(lines[i++]!)
    blocks.push({ t: "p", c: parseInline(para.map((l) => l.trim()).join("\n"), origin) })
  }
  return blocks
}

// ---------------------------------------------------------------------------------------------------------------
// Streaming

/**
 * While a reply is still arriving its Markdown is unfinished: an open code fence, a dangling `**`, half a link.
 * Closing those for display keeps the text from flickering between raw symbols and formatting as words land.
 * The saved text is never changed, only what is drawn.
 */
export function settleForStreaming(text: string): string {
  let out = text
  // Half a link at the very end: show its label, not the brackets and a partial address.
  out = out.replace(/\[([^\]\n]*)\]\([^)\n]*$/, "$1").replace(/\[[^\]\n]*$/, (m) => m.slice(1))
  const fences = out.split("\n").filter((l) => FENCE.test(l)).length
  if (fences % 2 === 1) return `${out}\n\`\`\``
  const lastLine = out.slice(out.lastIndexOf("\n") + 1)
  let tail = ""
  if (((lastLine.match(/`/g) ?? []).length) % 2 === 1) tail += "`"
  else if (((lastLine.match(/\*\*/g) ?? []).length) % 2 === 1) tail += "**"
  return out + tail
}

// ---------------------------------------------------------------------------------------------------------------
// Gains and losses

export type Piece = { v: string; tone?: "up" | "down" }

const SIGNED = /(?<![\w.$])([+\-−–])(\$?\d[\d,]*(?:\.\d+)?)(%)?(?![\w.]*\d)/g

/**
 * Splits text so signed money and percentages ("+1.2%", "−$340") can be drawn in the gain or loss colour, the
 * same way the rest of the app draws them. Only figures with an explicit sign and a % or $ count, so ranges,
 * dates and plain numbers are left alone.
 */
export function splitSigned(text: string): Piece[] {
  const out: Piece[] = []
  let last = 0
  for (const m of text.matchAll(SIGNED)) {
    const hasUnit = m[3] === "%" || m[2]!.startsWith("$")
    if (!hasUnit) continue
    const at = m.index!
    if (at > last) out.push({ v: text.slice(last, at) })
    out.push({ v: m[0], tone: m[1] === "+" ? "up" : "down" })
    last = at + m[0].length
  }
  if (last < text.length) out.push({ v: text.slice(last) })
  return out.length ? out : [{ v: text }]
}
