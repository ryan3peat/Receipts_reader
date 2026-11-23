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
    vatCents: resolveVatCents(transaction.total, transaction.extra),
    merchant: transaction.merchant,
    name: transaction.name,
    description: transaction.description,
    categoryCode: transaction.categoryCode,
    projectCode: transaction.projectCode,
  }
}

export async function receiptsForEmployee(userId: string, employeeId: string) {
  const rows = await prisma.transaction.findMany({
    where: { userId, submittedById: employeeId },
    orderBy: { issuedAt: "asc" },
  })
  return rows.map(toSapReceipt)
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
  return prisma.cardStatement.create({
    data: {
      userId: input.userId,
      employeeId: input.employeeId,
      fileId: input.fileId,
      filename: input.filename,
      accountName: input.accountName,
      accountNumber: input.accountNumber,
      periodLabel: input.periodLabel,
      lines: {
        create: input.lines.map((line) => ({
          postedOn: line.postedOn ? new Date(`${line.postedOn}T00:00:00.000Z`) : null,
          narrative: line.narrative,
          amount: line.amountCents,
          kind: line.kind,
          transactionId: line.transactionId,
        })),
      },
    },
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
  await prisma.$transaction(
    matches.map((match) =>
      prisma.cardStatementLine.update({
        where: { id: match.line.id },
        data: { transactionId: match.line.kind === "purchase" ? match.receipt?.id ?? null : null },
      })
    )
  )
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

export async function latestMissingForEmployee(userId: string, employeeId: string) {
  const latest = await prisma.cardStatement.findFirst({
    where: { userId, employeeId },
    orderBy: { createdAt: "desc" },
  })
  if (!latest) return []
  const statement = await rematchStatement(latest.id, userId)
  if (!statement) return []
  return statement.lines.filter((line) => line.kind === "purchase" && !line.transactionId)
}
