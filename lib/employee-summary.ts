import { calcTotalPerCurrency, isTransactionIncomplete } from "@/lib/stats"
import { TRANSACTION_STATUSES, toTransactionStatus, type TransactionStatus } from "@/lib/transaction-status"
import type { Field, Transaction } from "@/prisma/client"

export type EmployeeMember = { id: string; name: string; email: string; role: string }

export type PendingFile = { submittedById: string | null; createdAt: Date }

export type EmployeeSummary = {
  // null collects records that have no submitter (created before roles existed, or the person was removed)
  id: string | null
  name: string
  email: string
  role: string
  receipts: number
  statusCounts: Record<TransactionStatus, number>
  expenseTotals: Record<string, number>
  incomplete: number
  withoutFile: number
  pendingFiles: number
  lastUploadAt: Date | null
}

const UNASSIGNED = "__unassigned__"

function emptySummary(member: EmployeeMember | null): EmployeeSummary {
  return {
    id: member?.id ?? null,
    name: member ? member.name || member.email : "Unassigned",
    email: member?.email ?? "",
    role: member?.role ?? "",
    receipts: 0,
    statusCounts: { new: 0, submitted: 0, matched: 0, exported: 0 },
    expenseTotals: {},
    incomplete: 0,
    withoutFile: 0,
    pendingFiles: 0,
    lastUploadAt: null,
  }
}

function later(a: Date | null, b: Date): Date {
  return !a || b.getTime() > a.getTime() ? b : a
}

export function summarizeEmployees(
  members: EmployeeMember[],
  transactions: Transaction[],
  pendingFiles: PendingFile[],
  fields: Field[]
): EmployeeSummary[] {
  const rows = new Map<string, EmployeeSummary>(members.map((member) => [member.id, emptySummary(member)]))
  const grouped = new Map<string, Transaction[]>()

  // A submitter id that is no longer a member lands in the unassigned row instead of being dropped.
  const rowFor = (submittedById: string | null) => {
    const key = submittedById && rows.has(submittedById) ? submittedById : UNASSIGNED
    if (!rows.has(key)) rows.set(key, emptySummary(null))
    return { key, row: rows.get(key)! }
  }

  for (const transaction of transactions) {
    const { key, row } = rowFor(transaction.submittedById)
    row.receipts++
    row.statusCounts[toTransactionStatus(transaction.status)]++
    if (isTransactionIncomplete(fields, transaction)) row.incomplete++
    if (!Array.isArray(transaction.files) || transaction.files.length === 0) row.withoutFile++
    row.lastUploadAt = later(row.lastUploadAt, transaction.createdAt)
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key)!.push(transaction)
  }

  for (const [key, list] of grouped) {
    rows.get(key)!.expenseTotals = calcTotalPerCurrency(list.filter((transaction) => transaction.type === "expense"))
  }

  for (const file of pendingFiles) {
    const { row } = rowFor(file.submittedById)
    row.pendingFiles++
    row.lastUploadAt = later(row.lastUploadAt, file.createdAt)
  }

  return [...rows.values()].sort((a, b) => {
    if (a.id === null) return 1
    if (b.id === null) return -1
    return a.name.localeCompare(b.name)
  })
}

export function totalEmployeeSummaries(rows: EmployeeSummary[]) {
  const totals = {
    receipts: 0,
    statusCounts: { new: 0, submitted: 0, matched: 0, exported: 0 } as Record<TransactionStatus, number>,
    incomplete: 0,
    withoutFile: 0,
    pendingFiles: 0,
    expenseTotals: {} as Record<string, number>,
  }
  for (const row of rows) {
    totals.receipts += row.receipts
    for (const status of TRANSACTION_STATUSES) totals.statusCounts[status] += row.statusCounts[status]
    totals.incomplete += row.incomplete
    totals.withoutFile += row.withoutFile
    totals.pendingFiles += row.pendingFiles
    for (const [currency, amount] of Object.entries(row.expenseTotals)) {
      totals.expenseTotals[currency] = (totals.expenseTotals[currency] || 0) + amount
    }
  }
  return totals
}
