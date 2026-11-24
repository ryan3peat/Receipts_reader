import { prisma } from "@/lib/db"
import { type StatementSummary } from "@/lib/reconciliation"
import { rematchStatement } from "@/models/statements"
import { Prisma } from "@/prisma/client"

type SummaryRow = {
  id: string
  employee_id: string
  employee_name: string | null
  account_number: string | null
  month: string | null
  purchases: number
  missing: number
}

/** The newest month with a dated purchase on any statement. One cheap aggregate, used to size the recent window. */
export async function latestPurchaseMonth(userId: string): Promise<string | null> {
  const rows = await prisma.$queryRaw<{ month: string | null }[]>`
    SELECT to_char(MAX(l.posted_on), 'YYYY-MM') AS month
    FROM card_statement_lines l
    JOIN card_statements s ON s.id = l.statement_id
    WHERE s.user_id = ${userId}::uuid AND l.kind = 'purchase'`
  return rows[0]?.month ?? null
}

/**
 * Receipt counts for every statement in a range, in one query and without loading a single line.
 * A statement belongs to the month of its latest purchase. `from` keeps that month and later, `before` keeps earlier
 * ones. Statements with no dated purchase count as recent so they are never lost.
 */
export async function statementSummaries(
  userId: string,
  range: { from?: string; before?: string }
): Promise<StatementSummary[]> {
  const lastOn = Prisma.sql`MAX(l.posted_on) FILTER (WHERE l.kind = 'purchase')`
  let having = Prisma.empty
  if (range.from) having = Prisma.sql`HAVING ${lastOn} IS NULL OR ${lastOn} >= ${`${range.from}-01`}::date`
  if (range.before) having = Prisma.sql`HAVING ${lastOn} < ${`${range.before}-01`}::date`

  const rows = await prisma.$queryRaw<SummaryRow[]>`
    SELECT
      s.id,
      s.employee_id,
      u.name AS employee_name,
      s.account_number,
      to_char(${lastOn}, 'YYYY-MM') AS month,
      (COUNT(l.id) FILTER (WHERE l.kind = 'purchase'))::int AS purchases,
      (COUNT(l.id) FILTER (WHERE l.kind = 'purchase' AND l.transaction_id IS NULL))::int AS missing
    FROM card_statements s
    JOIN users u ON u.id = s.employee_id
    LEFT JOIN card_statement_lines l ON l.statement_id = s.id
    WHERE s.user_id = ${userId}::uuid
    GROUP BY s.id, u.name
    ${having}`

  return rows.map((row) => ({
    id: row.id,
    employeeId: row.employee_id,
    employeeName: row.employee_name || "Unnamed",
    accountNumber: row.account_number ?? "",
    month: row.month,
    purchases: row.purchases,
    missing: row.missing,
  }))
}

export type DetailLine = {
  id: string
  statementId: string
  postedOn: string | null
  narrative: string
  amountCents: number
  hasReceipt: boolean
}

export type GroupDetail = {
  purchases: number
  missing: number
  lines: DetailLine[]
}

/**
 * The purchases of one person's statements for a month, matched against their receipts right now.
 * Only the statements being opened are matched, which is what keeps the page itself quick.
 */
export async function groupDetail(userId: string, statementIds: string[]): Promise<GroupDetail> {
  const lines: DetailLine[] = []
  for (const statementId of statementIds) {
    const statement = await rematchStatement(statementId, userId)
    if (!statement) continue
    for (const line of statement.lines) {
      if (line.kind !== "purchase") continue
      lines.push({
        id: line.id,
        statementId,
        postedOn: line.postedOn ? line.postedOn.toISOString().slice(0, 10) : null,
        narrative: line.narrative,
        amountCents: line.amount,
        hasReceipt: Boolean(line.transactionId),
      })
    }
  }
  lines.sort((left, right) => (left.postedOn ?? "").localeCompare(right.postedOn ?? ""))
  return { purchases: lines.length, missing: lines.filter((line) => !line.hasReceipt).length, lines }
}
