export type LineKind = "purchase" | "payment" | "fee" | "refund"

export type GstLine = {
  gstCode: "P1" | "P2"
  amountCents: number
  note?: string
}

export type SapReceipt = {
  id: string
  issuedOn: string | null
  totalCents: number | null
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

export function matchStatementLines(lines: StatementPurchase[], receipts: SapReceipt[]): StatementMatch[] {
  const used = new Set<string>()
  return lines.map((line) => {
    if (line.kind !== "purchase") return { line, receipt: null }
    let best: { receipt: SapReceipt; score: number } | null = null
    for (const receipt of receipts) {
      if (used.has(receipt.id) || receipt.totalCents == null) continue
      const amountGap = Math.abs(receipt.totalCents - line.amountCents)
      const dayGap = daysApart(line.postedOn, receipt.issuedOn)
      const closeEnough = amountGap <= 100 || amountGap / Math.max(line.amountCents, 1) <= 0.02
      if (!closeEnough || dayGap > 7) continue
      const merchant = (receipt.merchant || "").toLowerCase()
      const narrative = line.narrative.toLowerCase()
      const tokenHit = merchant.split(/\s+/).filter((token) => token.length > 3 && narrative.includes(token)).length
      const score = amountGap + dayGap * 20 - tokenHit * 30
      if (!best || score < best.score) best = { receipt, score }
    }
    if (best) used.add(best.receipt.id)
    return { line, receipt: best?.receipt ?? null }
  })
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
  const splits = missing ? [] : gstLines(receipt.totalCents, receipt.vatCents)
  const glName = (receipt.categoryCode && catalog.categories.get(receipt.categoryCode)) || ""
  const project =
    (receipt.projectCode && (catalog.projects.get(receipt.projectCode) || receipt.projectCode)) || ""
  const description = receipt.name || receipt.description || ""
  if (splits.length === 0) {
    return [
      {
        date,
        narrative,
        description: missing ? "MISSING RECEIPT" : description,
        glCode: missing ? "" : receipt.categoryCode || "",
        glName: missing ? "" : glName,
        project: missing ? "" : project,
        gstCode: "",
        amountCents: receipt.totalCents ?? 0,
        dimension: catalog.dimension,
        note: missing ? "No receipt uploaded. Amount is the card charge, GST unknown." : "",
        missing,
      },
    ]
  }
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
