import {
  asDay,
  matchStatementLines,
  resolveVatCents,
  sapRowsForReceipts,
  sapRowsForStatement,
  type LineKind,
  type ParsedStatementLine,
  type SapReceipt,
  type SapRow,
  type StatementPurchase,
} from "@/lib/sap"
import { prisma } from "@/lib/db"

const KINDS = new Set<LineKind>(["purchase", "payment", "fee", "refund"])

function dayOf(value: Date | null | undefined) {
  if (!value || Number.isNaN(value.getTime())) return null
  return value.toISOString().slice(0, 10)
}

export function toSapReceipt(transaction: {
  id: string
  issuedAt: Date | null
  total: number | null
  convertedTotal?: number | null
  extra: unknown
  merchant: string | null
  name: string | null
  description: string | null
  categoryCode: string | null
  projectCode: string | null
}): SapReceipt {
  return {
    id: transaction.id,
    issuedOn: dayOf(transaction.issuedAt),
    totalCents: transaction.total,
    convertedTotalCents: transaction.convertedTotal ?? null,
    vatCents: resolveVatCents(transaction.total, transaction.extra),
    merchant: transaction.merchant,
    name: transaction.name,
    description: transaction.description,
    categoryCode: transaction.categoryCode,
    projectCode: transaction.projectCode,
  }
}

/**
 * Receipts for matching a cardholder's statement: owned by them, or saved from a file they uploaded
 * (Accounts may have stamped themselves as submitter when reviewing).
 */
export async function receiptsForEmployee(userId: string, employeeId: string) {
  const uploadedFiles = await prisma.file.findMany({
    where: { userId, submittedById: employeeId },
    select: { id: true },
  })
  const fileIds = uploadedFiles.map((file) => file.id)
  const rows = await prisma.transaction.findMany({
    where: {
      userId,
      OR: [
        { submittedById: employeeId },
        ...(fileIds.length > 0 ? fileIds.map((id) => ({ files: { array_contains: [id] } })) : []),
      ],
    },
    orderBy: { issuedAt: "asc" },
  })
  const seen = new Set<string>()
  return rows.flatMap((row) => {
    if (seen.has(row.id)) return []
    seen.add(row.id)
    return [toSapReceipt(row)]
  })
}

export async function sapCatalog(userId: string, employeeCode: string) {
  const [categories, projects] = await Promise.all([
    prisma.category.findMany({ where: { userId }, select: { code: true, name: true } }),
    prisma.project.findMany({ where: { userId }, select: { code: true, name: true } }),
  ])
  return {
    categories: new Map(categories.map((category) => [category.code, category.name])),
    projects: new Map(projects.map((project) => [project.code, project.name])),
    dimension: employeeCode,
  }
}

export async function rowsForEmployeeReceipts(userId: string, employeeId: string, employeeCode: string): Promise<SapRow[]> {
  const [receipts, catalog] = await Promise.all([
    receiptsForEmployee(userId, employeeId),
    sapCatalog(userId, employeeCode),
  ])
  return sapRowsForReceipts(receipts, catalog)
}

function purchasesFromLines(
  lines: { id: string; postedOn: Date | null; narrative: string; amount: number; kind: string }[]
): StatementPurchase[] {
  return lines.map((line) => ({
    id: line.id,
    postedOn: dayOf(line.postedOn),
    narrative: line.narrative,
    amountCents: line.amount,
    kind: KINDS.has(line.kind as LineKind) ? (line.kind as LineKind) : "purchase",
  }))
}

export async function saveCardStatement(input: {
  userId: string
  employeeId: string
  fileId: string
  filename: string
  accountName: string
  accountNumber: string
  periodLabel: string
  lines: Array<ParsedStatementLine & { transactionId: string | null }>
}) {
  return prisma.$transaction(async (tx) => {
    // Uploading the same card and period again replaces the earlier copy instead of doubling the lines.
    if (input.accountNumber && input.periodLabel) {
      await tx.cardStatement.deleteMany({
        where: {
          userId: input.userId,
          employeeId: input.employeeId,
          accountNumber: input.accountNumber,
          periodLabel: input.periodLabel,
        },
      })
    }
    return tx.cardStatement.create({
      data: {
        userId: input.userId,
        employeeId: input.employeeId,
        fileId: input.fileId,
        filename: input.filename,
        accountName: input.accountName,
        accountNumber: input.accountNumber,
        periodLabel: input.periodLabel,
        lines: {
          createMany: {
            data: input.lines.map((line) => ({
              postedOn: line.postedOn ? new Date(`${line.postedOn}T00:00:00.000Z`) : null,
              narrative: line.narrative,
              amount: line.amountCents,
              kind: line.kind,
              transactionId: line.transactionId,
            })),
          },
        },
      },
    })
  })
}

export async function rematchStatement(statementId: string, userId: string) {
  const statement = await prisma.cardStatement.findFirst({
    where: { id: statementId, userId },
    include: { lines: true },
  })
  if (!statement) return null
  const receipts = await receiptsForEmployee(userId, statement.employeeId)
  const purchases = purchasesFromLines(statement.lines)
  const matches = matchStatementLines(purchases, receipts)
  const current = new Map(statement.lines.map((line) => [line.id, line.transactionId]))
  // Only the lines whose receipt changed are written, so opening a page does not rewrite a whole statement.
  const changed = matches.flatMap((match) => {
    const transactionId = match.line.kind === "purchase" ? match.receipt?.id ?? null : null
    return current.get(match.line.id) === transactionId ? [] : [{ id: match.line.id, transactionId }]
  })
  if (changed.length > 0) {
    await prisma.$transaction(
      changed.map((line) =>
        prisma.cardStatementLine.update({ where: { id: line.id }, data: { transactionId: line.transactionId } })
      )
    )
  }
  return prisma.cardStatement.findFirst({
    where: { id: statementId, userId },
    include: {
      lines: { orderBy: { postedOn: "asc" } },
      employee: { select: { id: true, name: true, email: true, employeeCode: true, cardNumber: true } },
    },
  })
}

export async function rowsForStatement(statementId: string, userId: string) {
  const statement = await rematchStatement(statementId, userId)
  if (!statement) return null
  const receipts = await receiptsForEmployee(userId, statement.employeeId)
  const byId = new Map(receipts.map((receipt) => [receipt.id, receipt]))
  const catalog = await sapCatalog(userId, statement.employee.employeeCode || "")
  const rows = statement.lines.flatMap((line) => {
    const purchase = purchasesFromLines([line])[0]
    if (purchase.kind !== "purchase") return []
    const receipt = line.transactionId ? byId.get(line.transactionId) : null
    return sapRowsForStatement([purchase], receipt ? [receipt] : [], catalog)
  })
  const bankLines: ParsedStatementLine[] = statement.lines.map((line) => ({
    postedOn: asDay(line.postedOn),
    narrative: line.narrative,
    amountCents: line.amount,
    kind: KINDS.has(line.kind as LineKind) ? (line.kind as LineKind) : "purchase",
  }))
  return { rows, bankLines, statement }
}

export async function listStatements(userId: string) {
  return prisma.cardStatement.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: {
      employee: { select: { id: true, name: true, email: true } },
      lines: { select: { id: true, kind: true, transactionId: true, narrative: true, amount: true, postedOn: true } },
    },
  })
}

// The purchases on a person's latest statement that still have no receipt.
// A lost card and its replacement arrive in the same upload as two statements, so both are included.
export async function latestMissingForEmployee(userId: string, employeeId: string) {
  const latest = await prisma.cardStatement.findFirst({
    where: { userId, employeeId },
    orderBy: { createdAt: "desc" },
  })
  if (!latest) return { periodLabel: null, lines: [] }
  const sameUpload = latest.fileId
    ? await prisma.cardStatement.findMany({
        where: { userId, employeeId, fileId: latest.fileId },
        select: { id: true },
      })
    : [{ id: latest.id }]
  const found = []
  for (const statement of sameUpload) {
    const matched = await rematchStatement(statement.id, userId)
    if (matched) found.push(...matched.lines)
  }
  const lines = found
    .filter((line) => line.kind === "purchase" && !line.transactionId)
    .sort((left, right) => (left.postedOn?.getTime() ?? 0) - (right.postedOn?.getTime() ?? 0))
  return { periodLabel: latest.periodLabel, lines }
}
