/**
 * Turns pasted or uploaded holdings into rows we can import, without any
 * network: CSV/TSV exports from a brokerage (header row found automatically)
 * and plain lines like `AAPL 10 @ 150`. Anything it can't read confidently
 * returns null, and the caller can fall back to the AI reader.
 *
 * Free of database and framework imports so the tests can run it directly.
 */

export type ImportRow = {
  symbol: string
  quantity: number
  /** Average price paid per share, when the source had one. */
  avgCost: number | null
  name: string | null
  kind: "stock" | "crypto"
}

export type ParseOutcome = { rows: ImportRow[]; warnings: string[] }

const MAX_ROWS = 300

/** "$1,234.50", "(12.5)", "12.5%", "—" -> number or null. */
export function toNumber(raw: string | undefined): number | null {
  if (raw == null) return null
  let s = raw.trim()
  if (!s || /^(-+|—|–|n\/a|na|--)$/i.test(s)) return null
  const negative = /^\(.*\)$/.test(s) || s.startsWith("-") || s.startsWith("−")
  s = s.replace(/[()$£€,\s%+−-]/g, "")
  if (!/^\d*\.?\d+$/.test(s)) return null
  const n = Number(s)
  return Number.isFinite(n) ? (negative ? -n : n) : null
}

const SYMBOL_OK = /^[A-Z][A-Z0-9]{0,5}([.\-/][A-Z0-9]{1,2})?$/

/** Fidelity marks its money-market core position with `**`; totals and cash rows aren't holdings. */
const NOT_A_HOLDING = /^(cash|total|totals|pending|account total|account|balance|core)$/i

function cleanSymbol(raw: string | undefined): string | null {
  if (!raw) return null
  const s = raw.trim().replace(/\*+$/, "").toUpperCase()
  if (!SYMBOL_OK.test(s) || NOT_A_HOLDING.test(s)) return null
  return s.replace(/[-/]/g, ".")
}

/** Splits one delimited line, honouring double quotes. */
export function splitLine(line: string, delimiter: string): string[] {
  const out: string[] = []
  let cell = ""
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cell += '"'; i++ }
      else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === delimiter) { out.push(cell); cell = "" }
    else cell += ch
  }
  out.push(cell)
  return out.map((c) => c.trim())
}

const H = {
  symbol: /^(symbol|ticker|ticker symbol|stock symbol|security symbol|instrument)$/i,
  quantity: /^(quantity|qty|shares|share count|units|shares held|current quantity)$/i,
  avg: /^(avg\.? ?cost|average cost|average cost basis|avg\.? cost basis|avg\.? price|average price|average buy price|avg\.? buy price|cost per share|cost basis per share|price paid)$/i,
  total: /^(cost basis|cost basis total|total cost|total cost basis|book cost|book value)$/i,
  name: /^(name|description|security name|security description|company|instrument name)$/i,
}

/** A brokerage CSV/TSV export: finds the header row, then reads each holding beneath it. */
export function parseDelimited(text: string): ParseOutcome | null {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return null

  const delimiter = lines.some((l) => l.includes("\t")) ? "\t" : lines.filter((l) => l.includes(",")).length >= 2 ? "," : lines.some((l) => l.includes(";")) ? ";" : null
  if (!delimiter) return null

  let headerAt = -1
  let cols = { symbol: -1, quantity: -1, avg: -1, total: -1, name: -1 }
  for (let i = 0; i < Math.min(lines.length, 20); i++) {
    const cells = splitLine(lines[i]!, delimiter)
    const find = (re: RegExp) => cells.findIndex((c) => re.test(c.replace(/\s+/g, " ")))
    const found = { symbol: find(H.symbol), quantity: find(H.quantity), avg: find(H.avg), total: find(H.total), name: find(H.name) }
    if (found.symbol >= 0 && found.quantity >= 0) {
      headerAt = i
      cols = found
      break
    }
  }
  if (headerAt < 0) return null

  const rows = new Map<string, ImportRow>()
  const warnings: string[] = []
  let skipped = 0

  for (const line of lines.slice(headerAt + 1)) {
    const cells = splitLine(line, delimiter)
    const symbol = cleanSymbol(cells[cols.symbol])
    const quantity = toNumber(cells[cols.quantity])
    const name = cols.name >= 0 ? cells[cols.name]?.trim() || null : null
    if (!symbol || quantity == null || !(quantity > 0) || (name && /money market|cash & cash/i.test(name))) {
      // Trailing disclaimers and totals are normal in an export; only count rows that looked like data.
      if (cells[cols.symbol]?.trim()) skipped++
      continue
    }

    let avg = cols.avg >= 0 ? toNumber(cells[cols.avg]) : null
    if (avg == null && cols.total >= 0) {
      const total = toNumber(cells[cols.total])
      if (total != null && total > 0) avg = total / quantity
    }
    if (avg != null && !(avg > 0)) avg = null

    add(rows, { symbol, quantity, avgCost: avg, name, kind: "stock" })
  }

  if (rows.size === 0) return null
  if (skipped > 0) warnings.push(`Skipped ${skipped} row${skipped === 1 ? "" : "s"} that weren't holdings (cash, totals or notes).`)
  return finish(rows, warnings)
}

const LINE = /^([A-Za-z][A-Za-z0-9.\-]{0,9})[\s,:]+([\d,]*\.?\d+)(?:\s*(?:sh|shs|shares?))?(?:\s*(?:@|at|avg|cost|,)?\s*\$?([\d,]*\.?\d+))?\s*$/i

/** Plain lines: `AAPL 10`, `AAPL 10 @ 150.25`, `AAPL, 10, 150`. Needs most lines to fit, so prose isn't misread. */
export function parseLines(text: string): ParseOutcome | null {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  if (lines.length === 0) return null

  const rows = new Map<string, ImportRow>()
  let matched = 0
  for (const line of lines) {
    const m = LINE.exec(line)
    const symbol = m ? cleanSymbol(m[1]) : null
    const quantity = m ? toNumber(m[2]) : null
    if (!m || !symbol || quantity == null || !(quantity > 0)) continue
    matched++
    const avg = toNumber(m[3])
    add(rows, { symbol, quantity, avgCost: avg != null && avg > 0 ? avg : null, name: null, kind: "stock" })
  }

  if (matched === 0 || matched / lines.length < 0.6) return null
  const warnings = matched < lines.length ? [`Couldn't read ${lines.length - matched} line${lines.length - matched === 1 ? "" : "s"}; check the list below.`] : []
  return finish(rows, warnings)
}

/** Same ticker twice (two lots, two accounts): add the shares and weight the average cost. */
function add(rows: Map<string, ImportRow>, next: ImportRow) {
  const existing = rows.get(next.symbol)
  if (!existing) {
    rows.set(next.symbol, next)
    return
  }
  const quantity = existing.quantity + next.quantity
  const cost = existing.avgCost != null && next.avgCost != null ? (existing.avgCost * existing.quantity + next.avgCost * next.quantity) / quantity : null
  rows.set(next.symbol, { ...existing, quantity, avgCost: cost, name: existing.name ?? next.name })
}

function finish(rows: Map<string, ImportRow>, warnings: string[]): ParseOutcome {
  const list = [...rows.values()]
  if (list.length > MAX_ROWS) warnings.push(`Only the first ${MAX_ROWS} of ${list.length} holdings will be imported.`)
  return { rows: list.slice(0, MAX_ROWS), warnings }
}

/** The no-network reader: a brokerage export first, then plain lines. Null means "ask the AI reader". */
export function parseHoldingsText(text: string): ParseOutcome | null {
  return parseDelimited(text) ?? parseLines(text)
}

/** Cleans rows from any reader (including the AI one): valid symbols, positive numbers, duplicates merged. */
export function normalizeRows(
  raw: { symbol: string; quantity: number; avgCost?: number | null; name?: string | null; kind?: "stock" | "crypto" }[],
): ParseOutcome {
  const rows = new Map<string, ImportRow>()
  let dropped = 0
  for (const r of raw) {
    const kind = r.kind ?? "stock"
    const symbol = kind === "crypto" ? (/^[A-Za-z0-9]{2,10}$/.test(r.symbol.trim()) ? r.symbol.trim().toUpperCase() : null) : cleanSymbol(r.symbol)
    if (!symbol || !Number.isFinite(r.quantity) || !(r.quantity > 0)) {
      dropped++
      continue
    }
    const avg = r.avgCost != null && Number.isFinite(r.avgCost) && r.avgCost > 0 ? r.avgCost : null
    add(rows, { symbol, quantity: r.quantity, avgCost: avg, name: r.name?.trim().slice(0, 80) || null, kind })
  }
  return finish(rows, dropped > 0 ? [`Left out ${dropped} row${dropped === 1 ? "" : "s"} that weren't valid holdings.`] : [])
}
