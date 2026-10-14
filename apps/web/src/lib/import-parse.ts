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
  /** The price per share the source showed, used only when no market data source can price the ticker (mutual funds). */
  price: number | null
  /** Which account of the source this belongs to (for example "Roth IRA"), when the file has several. */
  account: string | null
  /** The market value the source showed for the whole position, used to cross-check shares × price. */
  value?: number | null
  /** Set when the numbers on this row don't agree with each other; the preview marks it for a second look. */
  flag?: string | null
}

/** A line that was left out on purpose, with the reason, so the preview can say what happened to it. */
export type SkippedLine = { text: string; reason: string }
export type ParseOutcome = { rows: ImportRow[]; warnings: string[]; skipped?: SkippedLine[] }

const MAX_ROWS = 300

/** "$1,234.50", "(12.5)", "12.5%", "—" -> number or null. */
export function toNumber(raw: string | undefined): number | null {
  if (raw == null) return null
  let s = raw.trim()
  if (!s || /^(-+|—|–|n\/a|na|--)$/i.test(s)) return null
  const negative = /^\(.*\)$/.test(s) || s.startsWith("-") || s.startsWith("−") || /-$/.test(s)
  s = s.replace(/[()$£€\s%+−-]/g, "")
  // European style: 1.234,56 or 22,5. A lone comma before 1-2 digits is a decimal point; before exactly 3 it is thousands.
  if (/^\d{1,3}(\.\d{3})+,\d+$/.test(s) || /^\d+,\d{1,2}$/.test(s)) s = s.replace(/\./g, "").replace(",", ".")
  else s = s.replace(/,/g, "")
  if (!/^\d*\.?\d+$/.test(s)) return null
  const n = Number(s)
  return Number.isFinite(n) ? (negative ? -n : n) : null
}

/** The first amount in text like "$27.70 / Share", for cells that carry words after the number. */
function leadingNumber(raw: string | undefined): number | null {
  const m = raw ? /\(?-?\$?[\d,]*\.?\d+\)?/.exec(raw) : null
  return m ? toNumber(m[0]) : null
}

const amount = (raw: string | undefined) => toNumber(raw) ?? leadingNumber(raw)

/** CUSIP-shaped identifiers used by retirement plans; these are not market tickers. */
export const isPlanIdentifier = (symbol: string) => /^[A-Z0-9]{8}[0-9]$/.test(symbol)

const SYMBOL_OK = /^[A-Z][A-Z0-9]{0,5}([.\-/][A-Z0-9]{1,2})?$/

/** Fidelity marks its money-market core position with `**`; totals and cash rows aren't holdings. */
const NOT_A_HOLDING = /^(cash|total|totals|pending|account total|account|balance|core)$/i

function cleanSymbol(raw: string | undefined): string | null {
  if (!raw) return null
  const s = raw.trim().replace(/\*+$/, "").toUpperCase()
  if ((!SYMBOL_OK.test(s) && !isPlanIdentifier(s)) || NOT_A_HOLDING.test(s)) return null
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
  symbol: /^(symbol|ticker|ticker symbol|stock symbol|security symbol|instrument|financial instrument|contract|asset|coin|security id|code)$/i,
  quantity: /^(quantity|qty|shares|share count|units|shares held|current quantity|shares\/units|anzahl|stück|stueck|menge|cantidad|quantité|quantite|balance|position|quantity owned|share balance|total shares|units held)$/i,
  avg: /^(avg\.? ?cost|average cost|average cost basis|avg\.? cost basis|avg\.? price|average price|average buy price|avg\.? buy price|cost per share|cost basis per share|price paid|unit cost|cost\/share|cost per unit|purchase price|buy price|average open price|avg\.? open price|einstandskurs|kaufkurs|precio medio|prix moyen|average cost price|cost price|avg\.? cost\/share|average price paid)$/i,
  total: /^(cost|cost basis|cost basis total|total cost|total cost basis|book cost|book value)$/i,
  name: /^(name|description|security name|security description|company|instrument name|security|investment name|investment option|fund name|fund|asset name)$/i,
  price: /^(last price|price|current price|last|share price|market price|nav|mark|last trade|kurs|precio|cours|close price|closing price|mark price|current share price|last price \(usd\))$/i,
  value: /^(current value|market value|value|total value|current market value|equity|market val|position value|wert|valor|valeur|amount|market value \(usd\)|total market value|balance \(usd\))$/i,
  totalReturn: /^(total return|return|total gain\/loss|gain\/loss|gain loss|unrealized gain\/loss|total p&l|p&l|unrealized p&l|total gain \(\$\)|gain\/loss \$)$/i,
  other: /^(portfolio diversity|% of (portfolio|account|holdings)|allocation|percent of (portfolio|account)|weight|today'?s return|day'?s gain|day change|change|% change|total return %|asset class|type|sector)$/i,
  accountName: /^(account name|account nickname|account title|account)$/i,
  accountType: /^(account type)$/i,
  accountNumber: /^(account number|account #|account no\.?|acct|acct\.? ?#?)$/i,
}

/** "Last Price $", "Qty #", "Value ($)", "Shares*" -> "last price", "qty", "value", "shares". */
export function normalizeHeader(cell: string): string {
  return cell.replace(/\([$%#]\)|[$#*]/g, "").replace(/\s+/g, " ").replace(/\.$/, "").trim()
}

const BLANKISH = /^(--?|—|–|n\/a|na|none)?$/i
const clean = (cell: string | undefined) => (cell && !BLANKISH.test(cell.trim()) ? cell.trim() : "")

/** IBKR activity statements: one file, many sections. Pull out just the Open Positions rows as a plain table. */
function ibkrOpenPositions(lines: string[]): string | null {
  const out: string[] = []
  for (const line of lines) {
    const cells = splitLine(line, ",")
    if (cells[0] !== "Open Positions") continue
    if (cells[1] === "Header") out.push(cells.slice(2).join(","))
    else if (cells[1] === "Data" && cells[2] === "Summary") out.push(cells.slice(2).map((c) => (/[",]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(","))
  }
  return out.length >= 2 ? out.join("\n") : null
}

/** Option contracts (`AAPL 11/15/2026 200 C`, `AAPL 261120C00200000`) and futures are not shares. */
const OPTION_SYMBOL = /\d{1,2}\/\d{1,2}\/\d{2,4}|\d{6}[CP]\d{5,8}|\s\d+(\.\d+)?\s*[CP]$|\b(call|put)\b/i

/** A brokerage CSV/TSV export: finds the header row, then reads each holding beneath it. */
export function parseDelimited(text: string): ParseOutcome | null {
  let lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return null
  if (lines.some((l) => l.startsWith("Open Positions,Header,"))) {
    const section = ibkrOpenPositions(lines)
    if (section) return parseDelimited(section)
  }
  // A table copied as aligned columns (two or more spaces between cells) reads like a tab-separated one.
  if (!lines.some((l) => l.includes("\t")) && lines.filter((l) => /\S {2,}\S/.test(l)).length >= 2) lines = lines.map((l) => l.trim().replace(/ {2,}/g, "\t"))

  const withMany = (d: string) => lines.filter((l) => l.split(d).length > 2).length
  const delimiter = lines.some((l) => l.includes("\t")) ? "\t" : withMany(";") > withMany(",") ? ";" : lines.filter((l) => l.includes(",")).length >= 2 ? "," : lines.some((l) => l.includes(";")) ? ";" : null
  if (!delimiter) return null

  let headerAt = -1
  let cols = { symbol: -1, quantity: -1, avg: -1, total: -1, name: -1, price: -1, value: -1, accountName: -1, accountType: -1, accountNumber: -1 }
  let headerKey = ""
  for (let i = 0; i < Math.min(lines.length, 200); i++) {
    const cells = splitLine(lines[i]!, delimiter)
    const find = (re: RegExp) => cells.findIndex((c) => re.test(normalizeHeader(c)))
    const found = {
      symbol: find(H.symbol),
      quantity: find(H.quantity),
      avg: find(H.avg),
      total: find(H.total),
      name: find(H.name),
      price: find(H.price),
      value: find(H.value),
      accountName: find(H.accountName),
      accountType: find(H.accountType),
      accountNumber: Math.max(find(H.accountNumber), cells.findIndex((c) => H.accountNumber.test(c.trim().replace(/\s+/g, " ")))),
    }
    if (found.symbol >= 0 && found.quantity >= 0) {
      headerAt = i
      cols = found
      headerKey = cells.map(normalizeHeader).join("|").toLowerCase()
      break
    }
  }
  if (headerAt < 0) return null

  // An account's name wins over its type, and its type over its number. A type (T. Rowe's "Roth IRA")
  // beats a column called "Account Name" that actually holds the fund's name.
  const nameCol = cols.accountType >= 0 ? cols.accountType : cols.accountName
  // Identical account nicknames need their account numbers to stay separate.
  const accountNumbers = new Map<string, Set<string>>()
  if (nameCol >= 0 && cols.accountNumber >= 0) {
    for (const line of lines.slice(headerAt + 1)) {
      const cells = splitLine(line, delimiter)
      const name = clean(cells[nameCol])
      const number = clean(cells[cols.accountNumber])
      if (name && number) accountNumbers.set(name, new Set([...(accountNumbers.get(name) ?? []), number]))
    }
  }
  const rows = new Map<string, ImportRow>()
  const warnings: string[] = []
  const skipped: SkippedLine[] = []
  // Schwab (and others) put the account's name on its own line above each repeat of the header.
  let sectionLabel: string | null = null
  const labelled = new Set<string>()
  if (headerAt > 0) {
    const above = splitLine(lines[headerAt - 1]!, delimiter)
    if (above.filter((c) => clean(c)).length === 1 && above[0] && !/^(positions for|data as of|as of|account summary|view summary|generated)/i.test(above[0])) sectionLabel = above[0].trim()
  }

  const body = lines.slice(headerAt + 1)
  for (let at = 0; at < body.length; at++) {
    const line = body[at]!
    const cells = splitLine(line, delimiter)
    const filled = cells.filter((c) => clean(c)).length
    const key = cells.map(normalizeHeader).join("|").toLowerCase()
    if (key === headerKey) continue // the same header again: a new account section
    if (filled === 1 && cells[0] && /* a label row sits directly above a repeat of the header */ body[at + 1] && splitLine(body[at + 1]!, delimiter).map(normalizeHeader).join("|").toLowerCase() === headerKey) {
      sectionLabel = cells[0].trim()
      continue
    }
    const symbolCell = cells[cols.symbol]?.trim() ?? ""
    // A different table (Vanguard puts transactions under the holdings) is not more holdings.
    if (H.symbol.test(normalizeHeader(symbolCell)) || cells.filter((c) => H.quantity.test(normalizeHeader(c)) || H.price.test(normalizeHeader(c))).length >= 2) break
    if (!symbolCell) continue
    const shown = line.replace(/\s+/g, " ").slice(0, 80)
    // Fidelity marks its cash core position (SPAXX**, FDRXX**, FCASH**) with asterisks.
    if (/\*\*$/.test(symbolCell)) {
      skipped.push({ text: shown, reason: "Cash and money-market balances aren't holdings" })
      continue
    }
    if (OPTION_SYMBOL.test(symbolCell)) {
      skipped.push({ text: shown, reason: "Options aren't supported" })
      continue
    }
    // A web page's symbol cell can hold "66585Y356 LSV US LARGE CAP CIT": code first, name after.
    let symbol = cleanSymbol(symbolCell)
    let cellName: string | null = null
    if (!symbol) {
      const [first = "", ...rest] = symbolCell.split(/\s+/)
      symbol = cleanSymbol(first)
      if (symbol) cellName = rest.join(" ") || null
    }
    const quantity = toNumber(cells[cols.quantity])
    const name = (cols.name >= 0 ? clean(cells[cols.name]) || null : null) ?? cellName ?? (cols.accountType >= 0 && cols.accountName >= 0 ? clean(cells[cols.accountName]) || null : null)
    if (name && /money market|cash & cash|sweep/i.test(name)) {
      skipped.push({ text: shown, reason: "Cash and money-market balances aren't holdings" })
      continue
    }
    if (!symbol) {
      skipped.push({ text: shown, reason: NOT_A_HOLDING.test(symbolCell.split(/\s+/)[0] ?? "") || /pending|total|cash/i.test(symbolCell) ? "Total, cash or pending row" : "Not a ticker we recognize" })
      continue
    }
    if (quantity == null) {
      skipped.push({ text: shown, reason: "No share count" })
      continue
    }
    if (!(quantity > 0)) {
      skipped.push({ text: shown, reason: quantity < 0 ? "Short position" : "Zero shares" })
      continue
    }

    let avg = cols.avg >= 0 ? amount(clean(cells[cols.avg])) : null
    let flag: string | null = null
    if (cols.total >= 0) {
      const total = amount(clean(cells[cols.total]))
      if (total != null && total > 0) {
        // The total is exact where the average is rounded, so it wins when they agree. When they don't, say so.
        if (avg != null && avg > 0 && !close(total / quantity, avg, 0.03)) flag = `Cost basis $${total} ÷ ${quantity} shares isn't the average cost $${avg} shown`
        avg = total / quantity
      }
    }
    if (avg != null && !(avg > 0)) avg = null

    // The same ticker in two accounts stays two positions. Its account is the name when
    // the file has one, otherwise the number, otherwise the label line above its table.
    const accountName = nameCol >= 0 ? clean(cells[nameCol]) : ""
    const accountNumber = cols.accountNumber >= 0 ? clean(cells[cols.accountNumber]) : ""
    const account = accountName && (accountNumbers.get(accountName)?.size ?? 0) > 1
      ? `${accountName} (${accountNumber || "unlabelled"})`
      : accountName || accountNumber || sectionLabel || null
    if (sectionLabel && account === sectionLabel) labelled.add(sectionLabel)
    // The price shown in the file, or its value divided by the shares.
    let price = cols.price >= 0 ? amount(clean(cells[cols.price])) : null
    const value = cols.value >= 0 ? amount(clean(cells[cols.value])) : null
    if ((price == null || !(price > 0)) && value != null && value > 0) price = value / quantity
    add(rows, { symbol, quantity, avgCost: avg, name, kind: "stock", account, price: price != null && price > 0 ? price : null, value: value != null && value > 0 ? value : null, flag })
  }

  if (rows.size === 0) return null
  // A single label line is a title, not an account: only several of them separate accounts.
  if (labelled.size === 1) {
    const only = [...labelled][0]!
    const relabelled = new Map<string, ImportRow>()
    for (const row of rows.values()) add(relabelled, row.account === only ? { ...row, account: null } : row)
    rows.clear()
    for (const [k, v] of relabelled) rows.set(k, v)
  }
  const real = skipped.filter((k) => k.reason !== "Total, cash or pending row")
  if (real.length > 0) warnings.push(`Left out ${real.length} row${real.length === 1 ? "" : "s"}: ${[...new Set(real.map((k) => k.reason.toLowerCase()))].join(", ")}.`)
  const out = finish(rows, warnings)
  return { ...out, skipped }
}


type Field = "symbol" | "quantity" | "avg" | "price" | "value" | "name" | "totalReturn" | "other"

function headerField(line: string): Field | null {
  const label = normalizeHeader(line)
  if (label.length > 40) return null
  for (const [field, re] of [["symbol", H.symbol], ["quantity", H.quantity], ["avg", H.avg], ["price", H.price], ["value", H.value], ["name", H.name], ["totalReturn", H.totalReturn], ["other", H.other]] as const) {
    if (re.test(label)) return field
  }
  // Any other short column title (Day Change %, Ratings, Security Type) is a column we don't use.
  if (label.split(" ").length <= 4 && /^[A-Za-z%$#'’/&().\- ?]+$/.test(label) && /(change|gain|loss|return|day|%|rating|reinvest|account|type|class|strategy|currency|ccy|cusip|registration|nickname|owner|date|interest|unrealized|cumulative|capital|dividend)/i.test(label)) return "other"
  return null
}

const isNumeric = (s: string) => toNumber(s) != null

/**
 * A page copied with one value per line: a run of column labels (Name, Symbol, Shares, Price…),
 * then each holding as that many lines. Rows that don't fit are skipped one line at a time so a
 * stray section title can't shift every row after it.
 */
export function parseVertical(text: string): ParseOutcome | null {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)

  let start = -1
  let fields: Field[] = []
  for (let i = 0; i < Math.min(lines.length, 60) && start < 0; i++) {
    const run: Field[] = []
    for (let j = i; j < lines.length; j++) {
      const f = headerField(lines[j]!)
      if (!f) break
      run.push(f)
    }
    if (run.length >= 4 && run.includes("symbol") && run.includes("quantity")) {
      start = i
      fields = run
    }
  }
  if (start < 0) return null

  const n = fields.length
  const at = (cells: string[], f: Field) => { const k = fields.indexOf(f); return k >= 0 ? cells[k] : undefined }
  const rows = new Map<string, ImportRow>()
  let skipped = 0
  for (let i = start + n; i < lines.length; ) {
    const cells = lines.slice(i, i + n)
    const symbol = cells.length === n ? cleanSymbol(at(cells, "symbol")) : null
    const quantity = toNumber(at(cells, "quantity"))
    const numericOk = cells.length === n && fields.every((f, k) => !["quantity", "price", "avg", "value"].includes(f) || isNumeric(cells[k]!) || /^(--?|—|n\/a)$/i.test(cells[k]!))
    if (!symbol || quantity == null || !(quantity > 0) || !numericOk) {
      skipped++
      i++
      continue
    }
    const avg = amount(at(cells, "avg"))
    const price = amount(at(cells, "price"))
    const value = amount(at(cells, "value"))
    const ret = amount(at(cells, "totalReturn"))
    const name = at(cells, "name")?.trim() || null
    let flag: string | null = null
    // Equity − return is what you paid; spread over the shares it should match the average cost shown.
    // A pasted loss often loses its minus sign, so either sign is accepted.
    if (avg != null && avg > 0 && value != null && ret != null && !close((value - ret) / quantity, avg, 0.03) && !close((value + Math.abs(ret)) / quantity, avg, 0.03)) flag = `Average cost $${avg} doesn't match the return shown`
    add(rows, {
      symbol, quantity, avgCost: avg != null && avg > 0 ? avg : null, name, kind: "stock", account: null,
      price: price != null && price > 0 ? price : value != null && value > 0 ? value / quantity : null,
      value: value != null && value > 0 ? value : null, flag,
    })
    i += n
  }
  if (rows.size === 0) return null
  // Section titles and the account summary above the table are normal; only mention real leftovers.
  const warnings = skipped > 12 ? ["Some lines didn't fit the table (totals, cash or other sections). Check for missing positions."] : []
  return finish(rows, warnings)
}

const TICKER_TOKEN = /^[A-Z][A-Z0-9]{0,5}(\.[A-Z])?$/

/**
 * Headerless rows on a single line, like `NVDA NVIDIA 22.056 $229.68 $73.56 $5,065.76`.
 * The shares and price are found as the pair whose product equals another number on the row,
 * which is how it knows which number is which.
 */
export function parseLoose(text: string): ParseOutcome | null {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const rows = new Map<string, ImportRow>()
  const labels = new Set<string>()
  let label: string | null = null
  let tried = 0
  for (const line of lines) {
    // A table row: tab-separated, or a CSV line with many cells. Otherwise the words are the cells.
    const commas = line.match(/,/g)?.length ?? 0
    const cells = line.includes("\t") ? line.split("\t").map((c) => c.trim()) : commas >= 4 ? splitLine(line, ",") : null
    const filled = cells ? cells.filter((c) => clean(c)) : []
    // A title line above a group of rows ("UNIVERSITY OF EXAMPLE 403(B) PLAN") names the account.
    if (cells ? filled.length === 1 : commas <= 1 && !/\d[\d,.]*\s*$/.test(line) && !/\s\$?[\d,]+\.\d/.test(line)) {
      const title = (cells ? filled[0]! : line.replace(/,+$/, "")).trim()
      if (title && title.length <= 80 && !/^(total|data as of|as of|all investments|your investments|generated|\*)/i.test(title)) label = title
      continue
    }
    const tokens = cells ? cells.flatMap((c, i) => (i === 0 ? [c] : [c])) : line.split(/\s+/).filter(Boolean)
    const bare = (t: string) => t.replace(/^\(|\)$/g, "").replace(/\*+$/, "")
    // A ticker in parentheses after a fund's name is the surest sign; otherwise the first ticker-shaped word.
    let symbolAt = -1
    let symbol: string | null = null
    let ambiguous: string | null = null
    if (cells) {
      for (let i = 0; i < tokens.length && !symbol; i++) {
        const m = /\(([A-Z]{2,6}(?:\.[A-Z])?)\)\s*$/.exec(tokens[i]!)
        if (m) { symbol = cleanSymbol(m[1]); symbolAt = i }
      }
    }
    if (!symbol) {
      const words = cells ? tokens.flatMap((c) => c.split(/\s+/)) : tokens
      symbolAt = words.findIndex((t) => /^\([A-Z]{2,6}(\.[A-Z])?\)$/.test(t))
      if (symbolAt < 0) symbolAt = words.findIndex((t) => TICKER_TOKEN.test(bare(t)) && !isNumeric(t))
      if (symbolAt < 0) continue
      // Names written in capitals ("SPDR ETF") look like tickers too; when there is a choice, say so.
      const firstNumber = words.findIndex((t) => /\d/.test(t))
      const candidates = [...new Set(words.slice(0, firstNumber < 0 ? words.length : firstNumber).map(bare).filter((t) => TICKER_TOKEN.test(t) && !isNumeric(t)))]
      if (symbolAt > 0 && !/^\(/.test(words[symbolAt]!) && candidates.length > 1) ambiguous = `Ticker might be ${candidates.slice(0, 3).join(", ")}; check it`
      symbol = cleanSymbol(bare(words[symbolAt]!))
      if (cells) {
        tokens.length = 0
        tokens.push(...words)
      }
    }
    // Digits inside a fund's name ("FIDELITY 500 INDEX") aren't figures: only numbers after the last word count.
    const lastWord = cells ? -1 : tokens.reduce((last, t, k) => (/[A-Za-z]/.test(t) && !/^(shares?|shs?|usd|units?)$/i.test(t) && !isNumeric(t) ? k : last), -1)
    const numTokens = tokens.filter((t, k) => k > lastWord && k !== symbolAt && /\d/.test(t) && !t.includes("%") && !/[A-Za-z]/.test(t.replace(/^\(.*\)$/, "")) && isNumeric(t.replace(/^[+]/, ""))).filter((t) => toNumber(t)! > 0)
    const nums = numTokens.map((t) => toNumber(t)!)
    if (nums.length < 3) continue
    tried++
    let found: { quantity: number; price: number; value: number; rest: number[] } | null = null
    search: for (let a = 0; a < nums.length; a++) {
      for (let b = 0; b < nums.length; b++) {
        if (a === b) continue
        for (let c = 0; c < nums.length; c++) {
          if (c === a || c === b) continue
          // Shares come before the price on the line, except in tables that list value first.
          if (cells ? false : a > b) continue
          if (close(nums[a]! * nums[b]!, nums[c]!, 0.005)) {
            // Money carries a $; a share count doesn't. When the order is ambiguous that tells them apart.
            const swap = numTokens[a]!.includes("$") && !numTokens[b]!.includes("$")
            found = { quantity: nums[swap ? b : a]!, price: nums[swap ? a : b]!, value: nums[c]!, rest: nums.filter((_, k) => k !== a && k !== b && k !== c) }
            break search
          }
        }
      }
    }
    if (!found || !symbol) continue
    // The leftover number that looks most like a per-share cost sits within a believable range of the price.
    // Without column labels a leftover number could be a day change or a gain, so cost is only guessed on plain lines.
    const avg = cells ? null : (found.rest.find((n) => n > found!.price / 20 && n < found!.price * 20) ?? null)
    const nameTokens = (cells ? tokens.slice(0, 1) : tokens.filter((t, k) => k !== symbolAt && !/\d/.test(t))).map((t) => t.replace(/\s*\([A-Z.]{2,7}\)\s*$/, "").replace(/^\(|\)$/g, ""))
    if (label) labels.add(label)
    add(rows, { symbol, quantity: found.quantity, avgCost: avg, name: nameTokens.join(" ").slice(0, 80) || null, kind: "stock", account: label, price: found.price, value: found.value, flag: ambiguous })
  }
  if (rows.size < 2 || rows.size / Math.max(tried, 1) < 0.8) return null
  // One title line is just a title; several separate the accounts.
  if (labels.size < 2) {
    const flat = new Map<string, ImportRow>()
    for (const row of rows.values()) add(flat, { ...row, account: null })
    return finish(flat, [])
  }
  return finish(rows, [])
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
    add(rows, { symbol, quantity, avgCost: avg != null && avg > 0 ? avg : null, name: null, kind: "stock", account: null, price: null })
  }

  if (matched === 0 || matched / lines.length < 0.6) return null
  const warnings = matched < lines.length ? [`Couldn't read ${lines.length - matched} line${lines.length - matched === 1 ? "" : "s"}; check the list below.`] : []
  return finish(rows, warnings)
}

/** Same ticker twice (two lots, two accounts): add the shares and weight the average cost. */
function add(rows: Map<string, ImportRow>, next: ImportRow) {
  const key = `${next.account ?? ""}|${next.symbol}`
  const existing = rows.get(key)
  if (!existing) {
    rows.set(key, next)
    return
  }
  const quantity = existing.quantity + next.quantity
  const cost = existing.avgCost != null && next.avgCost != null ? (existing.avgCost * existing.quantity + next.avgCost * next.quantity) / quantity : null
  const value = existing.value != null && next.value != null ? existing.value + next.value : null
  rows.set(key, { ...existing, quantity, avgCost: cost, name: existing.name ?? next.name, price: next.price ?? existing.price, value })
}

const close = (a: number, b: number, tolerance = 0.02) => Math.abs(a - b) <= Math.max(Math.abs(b) * tolerance, 0.02)

/** Shares × price should equal the position's value; when it doesn't, a column was probably misread. */
export function checkRow(row: ImportRow): string | null {
  if (row.price != null && row.value != null && !close(row.quantity * row.price, row.value, 0.03)) {
    return `${row.quantity} shares × $${row.price} is not the $${row.value} shown`
  }
  return row.flag ?? null
}

/** Bonds and CDs are quoted per $100 of face value: 44,000 × 98.484 is 100 times what the position is worth. */
function perUnitPrice(row: ImportRow): ImportRow {
  if (row.price != null && row.value != null && row.value > 0 && close((row.quantity * row.price) / row.value, 100, 0.03)) {
    return { ...row, price: row.value / row.quantity }
  }
  return row
}

function finish(rows: Map<string, ImportRow>, warnings: string[]): ParseOutcome {
  for (const [key, row] of rows) rows.set(key, { ...perUnitPrice(row), flag: checkRow(perUnitPrice(row)) })
  const flagged = [...rows.values()].filter((r) => r.flag).length
  if (flagged > 0) warnings.push(`${flagged} holding${flagged === 1 ? "" : "s"} ${flagged === 1 ? "has" : "have"} numbers that don't add up. Check ${flagged === 1 ? "it" : "them"} against your brokerage before importing.`)
  const list = [...rows.values()]
  if (list.length > MAX_ROWS) warnings.push(`Only the first ${MAX_ROWS} of ${list.length} holdings will be imported.`)
  return { rows: list.slice(0, MAX_ROWS), warnings }
}

/** The no-network reader: a brokerage export first, then plain lines. Null means "ask the AI reader". */
export function parseHoldingsText(text: string): ParseOutcome | null {
  return parseDelimited(text) ?? parseVertical(text) ?? parseLines(text) ?? parseLoose(text)
}

/** Cleans rows from any reader (including the AI one): valid symbols, positive numbers, duplicates merged. */
export function normalizeRows(
  raw: { symbol: string; quantity: number; avgCost?: number | null; name?: string | null; kind?: "stock" | "crypto"; account?: string | null; price?: number | null; value?: number | null }[],
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
    add(rows, { symbol, quantity: r.quantity, avgCost: avg, name: r.name?.trim().slice(0, 80) || null, kind, account: r.account?.trim().slice(0, 60) || null, price: r.price != null && Number.isFinite(r.price) && r.price > 0 ? r.price : null, value: r.value != null && Number.isFinite(r.value) && r.value > 0 ? r.value : null })
  }
  return finish(rows, dropped > 0 ? [`Left out ${dropped} row${dropped === 1 ? "" : "s"} that weren't valid holdings.`] : [])
}
