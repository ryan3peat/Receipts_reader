export type LineKind = "purchase" | "payment" | "fee" | "refund"

export type GstLine = {
  gstCode: "P1" | "P2"
  amountCents: number
  note?: string
}

export type SapReceipt = {
  id: string
  issuedOn: string | null
  /** Total in the receipt's own currency (see currencyCode). */
  totalCents: number | null
  currencyCode?: string | null
  /** Card/statement currency total when the receipt was in a foreign currency. */
  convertedTotalCents: number | null
  vatCents: number
  merchant: string | null
  name: string | null
  description: string | null
  categoryCode: string | null
  projectCode: string | null
}

export type StatementPurchase = {
  id: string
  postedOn: string | null
  narrative: string
  amountCents: number
  kind: LineKind
}

export type SapRow = {
  date: string | null
  narrative: string
  description: string
  glCode: string
  glName: string
  project: string
  gstCode: "" | "P1" | "P2"
  amountCents: number
  dimension: string
  note: string
  missing: boolean
}

const DAY = 24 * 60 * 60 * 1000

export function extraNumber(extra: unknown, key: string): number | null {
  if (!extra || typeof extra !== "object") return null
  const raw = (extra as Record<string, unknown>)[key]
  if (typeof raw === "number" && Number.isFinite(raw)) return raw
  if (typeof raw !== "string" || raw.trim() === "") return null
  const parsed = Number.parseFloat(raw)
  return Number.isFinite(parsed) ? parsed : null
}

// Extra money fields are stored as the dollar amount typed on the form.
export function moneyCents(extra: unknown, key: string): number {
  const value = extraNumber(extra, key)
  if (value === null) return 0
  return Math.round(value * 100)
}

/** Total minus GST, in cents. Matches the form field and the SAP "Amount after GST" column. */
export function netAmountAfterGstCents(totalCents: number | null | undefined, extra: unknown): number {
  const total = totalCents ?? 0
  return total - resolveVatCents(total, extra)
}

export function resolveVatCents(totalCents: number | null, extra: unknown): number {
  const vat = moneyCents(extra, "vat")
  if (vat > 0) return vat
  const rate = extraNumber(extra, "vat_rate")
  if (rate === 10 && totalCents && totalCents > 0) return Math.round(totalCents / 11)
  return 0
}

export function gstLines(totalCents: number | null, vatCents: number): GstLine[] {
  const total = totalCents ?? 0
  if (total <= 0) return [{ gstCode: "P2", amountCents: Math.max(0, total) }]
  if (vatCents <= 0) return [{ gstCode: "P2", amountCents: total }]

  const expected = Math.round(total / 11)
  const tolerance = Math.max(5, Math.round(total * 0.002))
  if (Math.abs(vatCents - expected) <= tolerance) {
    return [{ gstCode: "P1", amountCents: total - vatCents }]
  }

  const taxableEx = Math.round(vatCents * 10)
  const gstFree = total - vatCents - taxableEx
  if (gstFree > 1 && taxableEx > 0) {
    return [
      { gstCode: "P1", amountCents: taxableEx },
      {
        gstCode: "P2",
        amountCents: gstFree,
        note: "Split because the receipt includes a GST-free component",
      },
    ]
  }

  return [{ gstCode: "P1", amountCents: Math.max(0, total - vatCents) }]
}

/** Entertainment GLs that use the ATO 50-50 FBT method on SAP export. */
export const FBT_50_50_CODES = new Set(["2210", "2211"])

export type FbtSplitLine = GstLine & { glCode: "2210" | "2211" }

/**
 * Split entertainment spend for FBT filing: 50% to 2210 (P2, no GST claimed),
 * remaining 50% to 2211 with half the receipt GST (P1 / P2 as needed).
 * Amounts are ex-GST for P1 and gross for P2, matching gstLines / SAP "Amount after GST".
 *
 * The deductible half reconstructs taxable ex-GST as GST×10 so a GST-free
 * component survives (gstLines would otherwise collapse near-1/11 halves to one P1).
 */
export function entertainmentFbtSplits(totalCents: number | null, vatCents: number): FbtSplitLine[] {
  const total = Math.max(0, totalCents ?? 0)
  const vat = Math.max(0, vatCents)
  const nonDeductibleGross = Math.round(total / 2)
  const deductibleGross = total - nonDeductibleGross
  const deductibleGst = Math.floor(vat / 2)

  const lines: FbtSplitLine[] = [
    {
      glCode: "2210",
      gstCode: "P2",
      amountCents: nonDeductibleGross,
      note: "FBT 50-50: non-deductible half (no GST claim)",
    },
  ]

  if (deductibleGross <= 0) return lines

  if (deductibleGst <= 0) {
    lines.push({
      glCode: "2211",
      gstCode: "P2",
      amountCents: deductibleGross,
      note: "FBT 50-50: deductible half (GST-free)",
    })
    return lines
  }

  const taxableEx = Math.round(deductibleGst * 10)
  const gstFree = deductibleGross - deductibleGst - taxableEx

  if (taxableEx > 0) {
    lines.push({
      glCode: "2211",
      gstCode: "P1",
      amountCents: taxableEx,
      note: "FBT 50-50: deductible half (GST claimable)",
    })
  }

  if (gstFree > 0) {
    lines.push({
      glCode: "2211",
      gstCode: "P2",
      amountCents: gstFree,
      note: "FBT 50-50: deductible half (GST-free component)",
    })
  } else if (taxableEx <= 0) {
    lines.push({
      glCode: "2211",
      gstCode: "P1",
      amountCents: Math.max(0, deductibleGross - deductibleGst),
      note: "FBT 50-50: deductible half (GST claimable)",
    })
  }

  return lines
}

export function classifyLine(narrative: string, kind: string): LineKind {
  const text = narrative.toLowerCase()
  if (text.includes("card fee") || /\bfees?\b/.test(text)) return "fee"
  if (text.includes("payment") || text.includes("top up") || text.includes("topup")) return "payment"
  if (kind === "fee" || kind === "payment" || kind === "refund") return kind
  return "purchase"
}

export function asDay(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10)
  if (typeof value !== "string") return null
  const match = value.match(/\d{4}-\d{2}-\d{2}/)
  return match ? match[0] : null
}

export type ParsedStatementLine = {
  postedOn: string | null
  narrative: string
  amountCents: number
  kind: LineKind
}

export type ParsedStatement = {
  accountName: string
  accountNumber: string
  periodLabel: string
  lines: ParsedStatementLine[]
}

export function parseStatementOutput(output: Record<string, unknown>): ParsedStatement {
  const lines = Array.isArray(output.lines) ? output.lines : []
  return {
    accountName: typeof output.accountName === "string" ? output.accountName.trim() : "",
    accountNumber: typeof output.accountNumber === "string" ? output.accountNumber.trim() : "",
    periodLabel: typeof output.period === "string" ? output.period.trim() : "",
    lines: lines.flatMap((line) => {
      if (!line || typeof line !== "object") return []
      const row = line as Record<string, unknown>
      const narrative = typeof row.narrative === "string" ? row.narrative.trim() : ""
      if (!narrative) return []
      const amount = typeof row.amount === "number" ? row.amount : Number.parseFloat(String(row.amount ?? ""))
      if (!Number.isFinite(amount) || amount === 0) return []
      const kind = classifyLine(narrative, typeof row.kind === "string" ? row.kind.toLowerCase() : "")
      return [
        {
          postedOn: asDay(row.date),
          narrative,
          amountCents: Math.round(Math.abs(amount) * 100),
          kind,
        },
      ]
    }),
  }
}

// A combined statement: one PDF from the bank that covers every cardholder of the company.

export type ParsedCardSection = {
  accountName: string
  accountNumber: string
  periodLabel: string
  billing: boolean
  pages: number[]
  // "Total for this period" as printed. Negative when the bank prints CR.
  statedTotalCents: number | null
  lines: ParsedStatementLine[]
}

// One row of the bank's own "Cardholder summary" table.
export type BankSummaryRow = {
  accountNumber: string
  accountName: string
  creditsCents: number
  purchasesCents: number
  chargesCents: number
}

export type CombinedStatement = {
  sections: ParsedCardSection[]
  summary: BankSummaryRow[]
}

export function cardDigits(value: string | null | undefined): string {
  return (value || "").replace(/\D/g, "")
}

export function formatCardNumber(value: string | null | undefined): string {
  const digits = cardDigits(value)
  if (digits.length !== 16) return (value || "").trim()
  return digits.replace(/(\d{4})(?=\d)/g, "$1-")
}

const TITLES = new Set(["MR", "MRS", "MS", "MISS", "MX", "DR"])

// "MS TERRI ANNE MARTIN (continued)" and "Terri Anne Martin" are the same holder.
export function holderKey(name: string | null | undefined): string {
  return (name || "")
    .toUpperCase()
    .replace(/\(CONTINUED\)/g, " ")
    .replace(/[^A-Z0-9' -]/g, " ")
    .split(/\s+/)
    .filter((token) => token && !TITLES.has(token))
    .join(" ")
}

// Reads "$3,920.30CR" as -392030 and "$337.54" as 33754. Null when there is no amount.
export function parseMoney(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? Math.round(value * 100) : null
  if (typeof value !== "string") return null
  const digits = value.replace(/[^0-9.]/g, "")
  if (!/\d/.test(digits)) return null
  const amount = Number.parseFloat(digits)
  if (!Number.isFinite(amount)) return null
  const credit = /CR/i.test(value) || /^\s*-/.test(value)
  return Math.round(amount * 100) * (credit ? -1 : 1)
}

// The bank marks money coming back with CR, so the direction is known and only the type is worked out here.
export function classifyCardLine(narrative: string, credit: boolean): LineKind {
  const text = narrative.toLowerCase()
  if (credit) {
    return /payment|top ?up|direct debit/.test(text) ? "payment" : "refund"
  }
  if (/card fee|tran fee|transaction fee|interest charge|late payment fee/.test(text)) return "fee"
  return "purchase"
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function cleanHolderName(value: unknown): string {
  return str(value)
    .replace(/\(continued\)/gi, "")
    .replace(/\s+/g, " ")
    .trim()
}

function cardLines(raw: unknown): ParsedStatementLine[] {
  const rows = Array.isArray(raw) ? raw : []
  const lines: Array<ParsedStatementLine & { foreign: boolean }> = []
  for (const item of rows) {
    if (!item || typeof item !== "object") continue
    const row = item as Record<string, unknown>
    const narrative = str(row.narrative).replace(/\s+/g, " ")
    if (!narrative) continue

    // The bank repeats a foreign purchase on a second row that only shows the foreign amount.
    const repeated = narrative.match(/^FRGN AMT:?\s*(.*)$/i)
    if (repeated) {
      const previous = lines[lines.length - 1]
      if (previous && !previous.foreign && repeated[1]) {
        previous.narrative = `${previous.narrative} (${repeated[1]})`
        previous.foreign = true
      }
      continue
    }

    const amount = typeof row.amount === "number" ? row.amount : Number.parseFloat(String(row.amount ?? ""))
    if (!Number.isFinite(amount) || amount === 0) continue
    const credit = row.credit === true || amount < 0
    const foreign = str(row.foreign).replace(/^FRGN AMT:?\s*/i, "")
    lines.push({
      postedOn: asDay(row.date),
      narrative: foreign ? `${narrative} (${foreign})` : narrative,
      amountCents: Math.round(Math.abs(amount) * 100),
      kind: classifyCardLine(narrative, credit),
      foreign: Boolean(foreign),
    })
  }
  return lines.map((line) => ({
    postedOn: line.postedOn,
    narrative: line.narrative,
    amountCents: line.amountCents,
    kind: line.kind,
  }))
}

function summaryRows(raw: unknown): BankSummaryRow[] {
  const rows = Array.isArray(raw) ? raw : []
  return rows.flatMap((item) => {
    if (!item || typeof item !== "object") return []
    const row = item as Record<string, unknown>
    const accountNumber = str(row.accountNumber)
    if (cardDigits(accountNumber).length < 12) return []
    return [
      {
        accountNumber: formatCardNumber(accountNumber),
        accountName: cleanHolderName(row.cardholderName),
        creditsCents: Math.abs(parseMoney(row.credits) ?? 0),
        purchasesCents: Math.abs(parseMoney(row.purchases) ?? 0),
        chargesCents: Math.abs(parseMoney(row.charges) ?? 0),
      },
    ]
  })
}

// Joins the pages the model read, in any order, into one section per card.
// A card always starts on a page that prints its number; the pages after it only repeat the holder's name.
export function assembleStatement(rawPages: unknown[]): CombinedStatement {
  const pages = rawPages
    .flatMap((item) => {
      if (!item || typeof item !== "object") return []
      const page = item as Record<string, unknown>
      const number = typeof page.page === "number" ? page.page : Number.parseInt(String(page.page ?? ""), 10)
      return Number.isFinite(number) ? [{ ...page, page: number }] : []
    })
    .sort((left, right) => left.page - right.page)

  const sections: ParsedCardSection[] = []
  const summary: BankSummaryRow[] = []

  for (const page of pages as Array<Record<string, unknown> & { page: number }>) {
    const kind = str(page.kind).toLowerCase()

    for (const row of summaryRows(page.summary)) {
      if (!summary.some((known) => cardDigits(known.accountNumber) === cardDigits(row.accountNumber))) summary.push(row)
    }
    if (kind === "summary") continue

    const lines = cardLines(page.lines)
    const name = cleanHolderName(page.cardholderName)
    const billing = kind === "billing" || /^billing account/i.test(name)
    if (!billing && kind !== "cardholder" && lines.length === 0) continue

    const digits = cardDigits(str(page.accountNumber))
    const holders = sections.filter((section) => !section.billing)
    let section: ParsedCardSection | undefined
    if (billing) {
      section = sections.find((known) => known.billing)
    } else if (digits.length >= 12) {
      section = holders.find((known) => cardDigits(known.accountNumber) === digits)
    } else {
      const key = holderKey(name)
      section =
        (key ? [...holders].reverse().find((known) => holderKey(known.accountName) === key) : undefined) ??
        holders[holders.length - 1]
    }
    if (!section) {
      section = {
        accountName: billing ? "Billing account" : name,
        accountNumber: digits.length >= 12 ? formatCardNumber(digits) : "",
        periodLabel: "",
        billing,
        pages: [],
        statedTotalCents: null,
        lines: [],
      }
      sections.push(section)
    }

    section.pages.push(page.page)
    section.lines.push(...lines)
    if (!section.accountName && name) section.accountName = name
    if (!section.periodLabel) section.periodLabel = str(page.period)
    const stated = parseMoney(page.totalForPeriod)
    if (stated !== null) section.statedTotalCents = stated
  }

  return { sections, summary }
}

export function sectionTotals(lines: ParsedStatementLine[]) {
  let purchasesCents = 0
  let creditsCents = 0
  let feesCents = 0
  for (const line of lines) {
    if (line.kind === "purchase") purchasesCents += line.amountCents
    else if (line.kind === "fee") feesCents += line.amountCents
    else creditsCents += line.amountCents
  }
  return { purchasesCents, creditsCents, feesCents, netCents: purchasesCents + feesCents - creditsCents }
}

export type HolderCheck = {
  key: string
  name: string
  cards: string[]
  billing: boolean
  lineCount: number
  purchasesCents: number
  creditsCents: number
  feesCents: number
  // The bank's own figures for this holder, when the statement includes its summary table.
  bank: { purchasesCents: number; creditsCents: number; chargesCents: number } | null
  // Whether each card's lines add up to its printed "Total for this period".
  totalsAgree: boolean | null
  // The bank's summary table disagrees with the lines. Shown as a note only.
  summaryDiffers: boolean
  // True when the lines agree with the total printed on the cardholder's pages, null when no total was printed.
  ok: boolean | null
}

// Checks what was read against the totals the bank printed, one result per holder.
// A lost card and its replacement are one line in the bank's summary, so cards are grouped by holder.
export function checkStatement(statement: CombinedStatement): HolderCheck[] {
  const groups = new Map<string, ParsedCardSection[]>()
  for (const section of statement.sections) {
    const key = section.billing ? "BILLING ACCOUNT" : holderKey(section.accountName) || section.accountNumber
    groups.set(key, [...(groups.get(key) ?? []), section])
  }

  const claimed = new Set<BankSummaryRow>()
  const byCard = new Map<string, BankSummaryRow[]>()
  for (const [key, sections] of groups) {
    const cards = new Set(sections.map((section) => cardDigits(section.accountNumber)).filter(Boolean))
    const rows = statement.summary.filter((row) => cards.has(cardDigits(row.accountNumber)))
    rows.forEach((row) => claimed.add(row))
    byCard.set(key, rows)
  }

  return [...groups].map(([key, sections]) => {
    let rows = byCard.get(key) ?? []
    if (rows.length === 0) {
      // The summary cuts long names short, and the billing account prints no number on its own pages.
      rows = statement.summary.filter((row) => {
        if (claimed.has(row)) return false
        const rowKey = holderKey(row.accountName)
        if (rowKey.length < 6) return false
        return key.startsWith(rowKey) || rowKey.startsWith(key)
      })
      rows.forEach((row) => claimed.add(row))
    }

    const lines = sections.flatMap((section) => section.lines)
    const totals = sectionTotals(lines)
    const stated = sections.filter((section) => section.statedTotalCents !== null)
    const totalsAgree =
      stated.length === 0
        ? null
        : stated.every((section) => sectionTotals(section.lines).netCents === section.statedTotalCents)
    const bank =
      rows.length === 0
        ? null
        : {
            purchasesCents: rows.reduce((sum, row) => sum + row.purchasesCents, 0),
            creditsCents: rows.reduce((sum, row) => sum + row.creditsCents, 0),
            chargesCents: rows.reduce((sum, row) => sum + row.chargesCents, 0),
          }
    const bankAgrees =
      bank === null
        ? null
        : bank.purchasesCents === totals.purchasesCents &&
          bank.creditsCents === totals.creditsCents &&
          bank.chargesCents === totals.feesCents
    // The total printed on the cardholder's own pages is the authority. The summary table is read separately,
    // and a difference there is only noted, so a misread summary row cannot flag correct transactions.
    const ok = totalsAgree !== null ? totalsAgree : bankAgrees

    return {
      summaryDiffers: bankAgrees === false,
      key,
      name: sections[0].accountName,
      cards: sections.map((section) => section.accountNumber).filter(Boolean),
      billing: sections[0].billing,
      lineCount: lines.length,
      purchasesCents: totals.purchasesCents,
      creditsCents: totals.creditsCents,
      feesCents: totals.feesCents,
      bank,
      totalsAgree,
      ok,
    }
  })
}

export type Cardholder = { id: string; name: string; cardNumber: string | null }

// Finds the person a card belongs to: by card number first, then by first and last name.
export function matchCardholder(
  section: { accountName: string; accountNumber: string },
  people: Cardholder[]
): Cardholder | null {
  const digits = cardDigits(section.accountNumber)
  if (digits.length >= 12) {
    const byCard = people.filter((person) => cardDigits(person.cardNumber) === digits)
    if (byCard.length === 1) return byCard[0]
  }
  const tokens = new Set(holderKey(section.accountName).split(" ").filter(Boolean))
  if (tokens.size < 2) return null
  const byName = people.filter((person) => {
    const parts = holderKey(person.name).split(" ").filter(Boolean)
    if (parts.length < 2) return false
    return tokens.has(parts[0]) && tokens.has(parts[parts.length - 1])
  })
  return byName.length === 1 ? byName[0] : null
}

function daysApart(a: string | null, b: string | null) {
  if (!a || !b) return 99
  const left = Date.parse(`${a}T00:00:00.000Z`)
  const right = Date.parse(`${b}T00:00:00.000Z`)
  if (Number.isNaN(left) || Number.isNaN(right)) return 99
  return Math.abs(left - right) / DAY
}

export type StatementMatch = {
  line: StatementPurchase
  receipt: SapReceipt | null
}

/** Amounts on a receipt that can be compared to a statement charge (prefer converted AUD when present). */
export function receiptAmountCandidates(receipt: SapReceipt): number[] {
  const amounts: number[] = []
  if (receipt.convertedTotalCents != null && receipt.convertedTotalCents > 0) amounts.push(receipt.convertedTotalCents)
  if (receipt.totalCents != null && receipt.totalCents > 0) amounts.push(receipt.totalCents)
  return amounts
}

function amountGapToLine(receipt: SapReceipt, lineAmountCents: number): number | null {
  const amounts = receiptAmountCandidates(receipt)
  if (amounts.length === 0) return null
  return Math.min(...amounts.map((amount) => Math.abs(amount - lineAmountCents)))
}

// Generic receipt words that appear on many unrelated bank narratives. They must not count as a merchant match.
const GENERIC_TOKENS = new Set([
  "subscription", "monthly", "annual", "plus", "pack", "purchase", "payment", "invoice", "receipt", "order",
  "paid", "visa", "mastercard", "ending", "card", "credit", "debit", "total", "amount", "service", "services",
  "online", "account", "billing", "charge", "charged", "with", "from", "that", "this", "have", "pty", "ltd",
  "com", "www", "australia", "sydney", "melbourne", "digital", "supporting", "january", "february", "march",
  "april", "may", "june", "july", "august", "september", "october", "november", "december", "due", "date",
])

/** Words from merchant/name/description that can appear on a bank narrative. */
export function receiptNarrativeTokens(receipt: SapReceipt): string[] {
  const text = [receipt.merchant, receipt.name, receipt.description].filter(Boolean).join(" ").toLowerCase()
  return [
    ...new Set(
      text
        .split(/[^a-z0-9]+/)
        .filter((token) => token.length > 3 && /[a-z]/.test(token) && !GENERIC_TOKENS.has(token))
    ),
  ]
}

function tokenHits(receipt: SapReceipt, narrative: string): number {
  const lower = narrative.toLowerCase()
  return receiptNarrativeTokens(receipt).filter((token) => lower.includes(token)).length
}

// Currency names the bank prints in brackets on foreign charges, e.g. "(96.90 US dollar)".
const CURRENCY_NAMES: Record<string, string> = {
  "us dollar": "USD",
  "usd": "USD",
  "euro": "EUR",
  "british pound": "GBP",
  "pound sterling": "GBP",
  "singapore dollar": "SGD",
  "hong kong dollar": "HKD",
  "new zealand dollar": "NZD",
  "canadian dollar": "CAD",
  "japanese yen": "JPY",
  "swiss franc": "CHF",
  "vietnamese dong": "VND",
  "dong": "VND",
  "indian rupee": "INR",
  "thai baht": "THB",
  "malaysian ringgit": "MYR",
  "chinese yuan": "CNY",
}

/** The foreign amount printed on a statement line, e.g. "(96.90 US dollar)" or "(162,205 Dong)". */
export function foreignAmountOnNarrative(narrative: string): { cents: number; currencyCode: string } | null {
  const match = narrative.match(/\(([\d,]+(?:\.\d+)?)\s+([A-Za-z][A-Za-z ]*?)\)\s*$/)
  if (!match) return null
  const currencyCode = CURRENCY_NAMES[match[2].trim().toLowerCase()]
  if (!currencyCode) return null
  const value = parseFloat(match[1].replace(/,/g, ""))
  if (!Number.isFinite(value) || value <= 0) return null
  return { cents: Math.round(value * 100), currencyCode }
}

/** True when the receipt's own-currency total equals the foreign amount printed on the statement line. */
function foreignAmountMatches(receipt: SapReceipt, narrative: string): boolean {
  const foreign = foreignAmountOnNarrative(narrative)
  if (!foreign || receipt.totalCents == null || !receipt.currencyCode) return false
  if (receipt.currencyCode.toUpperCase() !== foreign.currencyCode) return false
  return Math.abs(receipt.totalCents - foreign.cents) <= Math.max(100, foreign.cents * 0.01)
}

/**
 * Match statement purchases to receipts for one cardholder.
 * Exact/near amount (±$1 or 2%) is preferred. FX and similar cases can still match when the
 * merchant/name shows up in the narrative and the amount is within 15% or $25.
 */
export function matchStatementLines(lines: StatementPurchase[], receipts: SapReceipt[]): StatementMatch[] {
  // Score every eligible (line, receipt) pair first, then assign globally from best score down.
  // Assigning in statement order let an early line take a receipt that fits a later line much better.
  const pairs: { lineIndex: number; receipt: SapReceipt; score: number }[] = []
  lines.forEach((line, lineIndex) => {
    if (line.kind !== "purchase") return
    for (const receipt of receipts) {
      const amountGap = amountGapToLine(receipt, line.amountCents)
      if (amountGap === null) continue
      const dayGap = daysApart(line.postedOn, receipt.issuedOn)
      if (dayGap > 7) continue
      const hits = tokenHits(receipt, line.narrative)
      const tight = amountGap <= 100 || amountGap / Math.max(line.amountCents, 1) <= 0.02
      const fxSoft =
        hits >= 1 && (amountGap <= 2500 || amountGap / Math.max(line.amountCents, 1) <= 0.15)
      // Same foreign amount and currency as the bank printed: strongest signal, even when the AUD gap is large.
      const foreignExact = foreignAmountMatches(receipt, line.narrative)
      if (!tight && !fxSoft && !foreignExact) continue
      const score = foreignExact ? dayGap * 20 - 10000 : amountGap + dayGap * 20 - hits * 30
      pairs.push({ lineIndex, receipt, score })
    }
  })
  pairs.sort((a, b) => a.score - b.score)

  const usedLines = new Set<number>()
  const usedReceipts = new Set<string>()
  const assigned = new Map<number, SapReceipt>()
  for (const pair of pairs) {
    if (usedLines.has(pair.lineIndex) || usedReceipts.has(pair.receipt.id)) continue
    usedLines.add(pair.lineIndex)
    usedReceipts.add(pair.receipt.id)
    assigned.set(pair.lineIndex, pair.receipt)
  }
  return lines.map((line, lineIndex) => ({ line, receipt: assigned.get(lineIndex) ?? null }))
}

type Catalog = {
  categories: Map<string, string>
  projects: Map<string, string>
  dimension: string
}

function rowsForReceipt(
  receipt: SapReceipt,
  narrative: string,
  date: string | null,
  catalog: Catalog,
  missing: boolean
): SapRow[] {
  const project =
    (receipt.projectCode && (catalog.projects.get(receipt.projectCode) || receipt.projectCode)) || ""
  const description = receipt.name || receipt.description || ""
  const useFbt =
    !missing && !!receipt.categoryCode && FBT_50_50_CODES.has(receipt.categoryCode)

  if (missing) {
    return [
      {
        date,
        narrative,
        description: "MISSING RECEIPT",
        glCode: "",
        glName: "",
        project: "",
        gstCode: "",
        amountCents: receipt.totalCents ?? 0,
        dimension: catalog.dimension,
        note: "No receipt uploaded. Amount is the card charge, GST unknown.",
        missing: true,
      },
    ]
  }

  if (useFbt) {
    return entertainmentFbtSplits(receipt.totalCents, receipt.vatCents).map((split) => ({
      date,
      narrative,
      description,
      glCode: split.glCode,
      glName: catalog.categories.get(split.glCode) || "",
      project,
      gstCode: split.gstCode,
      amountCents: split.amountCents,
      dimension: catalog.dimension,
      note: split.note || "",
      missing: false,
    }))
  }

  const splits = gstLines(receipt.totalCents, receipt.vatCents)
  const glName = (receipt.categoryCode && catalog.categories.get(receipt.categoryCode)) || ""
  return splits.map((split) => ({
    date,
    narrative,
    description,
    glCode: receipt.categoryCode || "",
    glName,
    project,
    gstCode: split.gstCode,
    amountCents: split.amountCents,
    dimension: catalog.dimension,
    note: split.note || "",
    missing: false,
  }))
}

export function sapRowsForStatement(
  lines: StatementPurchase[],
  receipts: SapReceipt[],
  catalog: Catalog
): SapRow[] {
  return matchStatementLines(lines, receipts).flatMap(({ line, receipt }) => {
    if (line.kind !== "purchase") return []
    if (!receipt) {
      return rowsForReceipt(
        {
          id: line.id,
          issuedOn: line.postedOn,
          totalCents: line.amountCents,
          convertedTotalCents: null,
          vatCents: 0,
          merchant: null,
          name: null,
          description: null,
          categoryCode: null,
          projectCode: null,
        },
        line.narrative,
        line.postedOn,
        catalog,
        true
      )
    }
    return rowsForReceipt(receipt, line.narrative, line.postedOn, catalog, false)
  })
}

export function sapRowsForReceipts(receipts: SapReceipt[], catalog: Catalog): SapRow[] {
  return receipts.flatMap((receipt) =>
    rowsForReceipt(receipt, receipt.merchant || receipt.name || "", receipt.issuedOn, catalog, false)
  )
}

export function missingPurchases(matches: StatementMatch[]) {
  return matches.filter((match) => match.line.kind === "purchase" && !match.receipt)
}
