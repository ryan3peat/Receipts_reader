import { listMembers } from "@/lib/access"
import { prisma } from "@/lib/db"
import { summarizeEmployees } from "@/lib/employee-summary"
import type { Prisma } from "@/prisma/client"
import { getFields } from "./fields"

export type EmployeePeriod = { dateFrom?: string; dateTo?: string }

// Callers must check the accounts role first: this reads every employee's records.
export async function getEmployeeSummaries(userId: string, period: EmployeePeriod = {}) {
  const where: Prisma.TransactionWhereInput = { userId }
  // Same day bounds as the transactions list, so the counts match after drilling down.
  if (period.dateFrom || period.dateTo) {
    where.issuedAt = {
      gte: period.dateFrom ? new Date(`${period.dateFrom}T00:00:00.000Z`) : undefined,
      lte: period.dateTo ? new Date(`${period.dateTo}T23:59:59.999Z`) : undefined,
    }
  }

  const [members, transactions, pendingFiles, fields] = await Promise.all([
    listMembers(),
    prisma.transaction.findMany({ where }),
    prisma.file.findMany({
      where: { userId, isReviewed: false },
      select: { submittedById: true, createdAt: true },
    }),
    getFields(userId),
  ])

  return summarizeEmployees(members, transactions, pendingFiles, fields)
}
