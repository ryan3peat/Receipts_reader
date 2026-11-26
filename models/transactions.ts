import { prisma } from "@/lib/db"
import type { DepartmentSplit } from "@/lib/gl-resolve"
import { COMPUTED_FIELD_CODES } from "@/models/defaults-data"
import { isTransactionStatus, type ManualTransactionStatus } from "@/lib/transaction-status"
import { scopeTransactionWhere } from "@/lib/visibility"
import { Field, Prisma, Transaction } from "@/prisma/client"
import { cache } from "react"
import { getFields } from "./fields"
import { deleteFile } from "./files"

export type TransactionData = {
  name?: string | null
  description?: string | null
  merchant?: string | null
  total?: number | null
  currencyCode?: string | null
  convertedTotal?: number | null
  convertedCurrencyCode?: string | null
  type?: string | null
  items?: TransactionData[] | undefined
  note?: string | null
  files?: string[] | undefined
  extra?: Record<string, unknown>
  categoryCode?: string | null
  /** The GL choice the cardholder made (a GlField key). Null or undefined when it was not set. */
  glFieldKey?: string | null
  /** Departments the receipt is charged to. Null clears them. Undefined leaves them unchanged. */
  departmentSplits?: DepartmentSplit[] | null
  projectCode?: string | null
  issuedAt?: Date | string | null
  text?: string | null
  [key: string]: unknown
}

// glFieldKey and departmentSplits are written only through glColumns, never through the field spread.
function withoutGlColumns(standard: TransactionData) {
  const { glFieldKey: _glFieldKey, departmentSplits: _departmentSplits, ...plain } = standard
  return plain
}

// Only the columns the caller actually sent are written, so saving one form never clears another person's data.
function glColumns(data: TransactionData): {
  glFieldKey?: string | null
  departmentSplits?: Prisma.InputJsonValue | typeof Prisma.DbNull
} {
  const columns: {
    glFieldKey?: string | null
    departmentSplits?: Prisma.InputJsonValue | typeof Prisma.DbNull
  } = {}
  if (data.glFieldKey !== undefined) columns.glFieldKey = data.glFieldKey
  if (data.departmentSplits !== undefined) {
    columns.departmentSplits =
      data.departmentSplits === null ? Prisma.DbNull : (data.departmentSplits as unknown as Prisma.InputJsonValue)
  }
  return columns
}

export type TransactionFilters = {
  search?: string
  dateFrom?: string
  dateTo?: string
  ordering?: string
  categoryCode?: string
  projectCode?: string
  submittedById?: string
  status?: string
  type?: string
  page?: number
}

export type TransactionPagination = {
  limit: number
  offset: number
}

export const getTransactions = cache(
  async (
    userId: string,
    filters?: TransactionFilters,
    pagination?: TransactionPagination
  ): Promise<{
    transactions: Transaction[]
    total: number
  }> => {
    const where: Prisma.TransactionWhereInput = { userId }
    let orderBy: Prisma.TransactionOrderByWithRelationInput = { issuedAt: "desc" }

    if (filters) {
      if (filters.search) {
        where.OR = [
          { name: { contains: filters.search, mode: "insensitive" } },
          { merchant: { contains: filters.search, mode: "insensitive" } },
          { description: { contains: filters.search, mode: "insensitive" } },
          { note: { contains: filters.search, mode: "insensitive" } },
          { text: { contains: filters.search, mode: "insensitive" } },
        ]
      }

      if (filters.dateFrom || filters.dateTo) {
        where.issuedAt = {
          gte: filters.dateFrom ? new Date(`${filters.dateFrom}T00:00:00.000Z`) : undefined,
          lte: filters.dateTo ? new Date(`${filters.dateTo}T23:59:59.999Z`) : undefined,
        }
      }

      if (filters.categoryCode) {
        where.categoryCode = filters.categoryCode
      }

      if (filters.projectCode) {
        where.projectCode = filters.projectCode
      }

      if (filters.submittedById) {
        where.submittedById = filters.submittedById
      }

      if (filters.type) {
        where.type = filters.type
      }

      if (isTransactionStatus(filters.status)) {
        where.status = filters.status
      }

      if (filters.ordering) {
        const isDesc = filters.ordering.startsWith("-")
        const field = isDesc ? filters.ordering.slice(1) : filters.ordering
        orderBy = { [field]: isDesc ? "desc" : "asc" }
      }
    }

    await scopeTransactionWhere(where)

    if (pagination) {
      const total = await prisma.transaction.count({ where })
      const transactions = await prisma.transaction.findMany({
        where,
        include: {
          category: true,
          project: true,
          submittedBy: true,
        },
        orderBy,
        take: pagination?.limit,
        skip: pagination?.offset,
      })
      return { transactions, total }
    } else {
      const transactions = await prisma.transaction.findMany({
        where,
        include: {
          category: true,
          project: true,
          submittedBy: true,
        },
        orderBy,
      })
      return { transactions, total: transactions.length }
    }
  }
)

export const getTransactionById = cache(async (id: string, userId: string): Promise<Transaction | null> => {
  const where: Prisma.TransactionWhereInput = { id, userId }
  await scopeTransactionWhere(where)
  return await prisma.transaction.findFirst({
    where,
    include: {
      category: true,
      project: true,
      submittedBy: true,
    },
  })
})

export const getTransactionsByFileId = cache(async (fileId: string, userId: string): Promise<Transaction[]> => {
  const where: Prisma.TransactionWhereInput = { files: { array_contains: [fileId] }, userId }
  await scopeTransactionWhere(where)
  return await prisma.transaction.findMany({ where })
})

// --- 1. New Dedicated Deduplication Function ---
export const findDuplicateTransaction = async (userId: string, data: TransactionData) => {
  const { standard } = await splitTransactionDataExtraFields(data, userId)
  const currencyCode = standard.currencyCode || "USD"

  if (standard.total && standard.merchant && standard.issuedAt) {
    const existingTransaction = await prisma.transaction.findFirst({
      where: {
        userId: userId,
        total: standard.total,
        merchant: standard.merchant,
        issuedAt: standard.issuedAt,
        currencyCode: currencyCode,
      },
    })

    return existingTransaction
  }

  return null
}

async function ownedCode(userId: string, model: "category" | "project", value: unknown): Promise<string | null> {
  if (typeof value !== "string") return null
  const code = value.trim()
  if (!code || code === "-") return null
  const match = { userId, OR: [{ code }, { name: { equals: code, mode: "insensitive" as const } }] }
  const row =
    model === "category"
      ? await prisma.category.findFirst({ where: match })
      : await prisma.project.findFirst({ where: match })
  return row?.code ?? null
}

async function withOwnedRelations(userId: string, standard: TransactionData) {
  standard.categoryCode = await ownedCode(userId, "category", standard.categoryCode)
  standard.projectCode = await ownedCode(userId, "project", standard.projectCode)
  return standard
}

export const createTransaction = async (
  userId: string,
  data: TransactionData,
  options?: { submittedById?: string | null }
): Promise<Transaction> => {
  const { standard, extra } = await splitTransactionDataExtraFields(data, userId)
  await withOwnedRelations(userId, standard)
  const { getActor } = await import("@/lib/access")
  const actor = await getActor()
  // Prefer the uploader when Accounts reviews someone else's receipt; otherwise the person saving it.
  const submittedById = options?.submittedById || actor.user.id
  const plain = withoutGlColumns(standard)

  const newTransaction = await prisma.transaction.create({
    data: {
      ...plain,
      extra: extra,
      items: data.items as Prisma.InputJsonValue,
      userId,
      submittedById,
      ...glColumns(data),
    },
  })

  return newTransaction
}

export const updateTransaction = async (id: string, userId: string, data: TransactionData): Promise<Transaction> => {
  const existing = await getTransactionById(id, userId)
  if (!existing) {
    throw new Error("Transaction not found")
  }
  const { standard, extra } = await splitTransactionDataExtraFields(data, userId)
  await withOwnedRelations(userId, standard)

  return await prisma.transaction.update({
    where: { id },
    data: {
      ...withoutGlColumns(standard),
      extra: extra,
      items: data.items ? (data.items as Prisma.InputJsonValue) : [],
      ...glColumns(data),
    },
  })
}

export const updateTransactionFiles = async (id: string, userId: string, files: string[]): Promise<Transaction> => {
  const existing = await getTransactionById(id, userId)
  if (!existing) {
    throw new Error("Transaction not found")
  }
  return await prisma.transaction.update({
    where: { id },
    data: { files },
  })
}

export const deleteTransaction = async (id: string, userId: string): Promise<Transaction | undefined> => {
  const transaction = await getTransactionById(id, userId)

  if (transaction) {
    const files = Array.isArray(transaction.files) ? transaction.files : []

    for (const fileId of files as string[]) {
      if ((await getTransactionsByFileId(fileId, userId)).length <= 1) {
        await deleteFile(fileId, userId)
      }
    }

    return await prisma.transaction.delete({
      where: { id, userId },
    })
  }
}

export const bulkDeleteTransactions = async (ids: string[], userId: string) => {
  // Cardholders may only delete what they submitted, so resolve the allowed rows first.
  const where: Prisma.TransactionWhereInput = { id: { in: ids }, userId }
  await scopeTransactionWhere(where)
  const allowed = await prisma.transaction.findMany({ where, select: { id: true, files: true } })
  const allowedIds = allowed.map((transaction) => transaction.id)
  if (allowedIds.length === 0) return { count: 0 }

  const result = await prisma.transaction.deleteMany({
    where: { id: { in: allowedIds }, userId },
  })

  const fileIds = new Set(
    allowed.flatMap((transaction) => (Array.isArray(transaction.files) ? (transaction.files as string[]) : []))
  )
  for (const fileId of fileIds) {
    const stillUsed = await prisma.transaction.count({ where: { userId, files: { array_contains: [fileId] } } })
    if (stillUsed === 0) await deleteFile(fileId, userId)
  }

  return result
}

// Callers must check the accounts role first. Exported rows are left alone: only an export batch may change them.
export const bulkSetTransactionStatus = async (ids: string[], userId: string, status: ManualTransactionStatus) => {
  return await prisma.transaction.updateMany({
    where: { id: { in: ids }, userId, status: { not: "exported" } },
    data: { status },
  })
}

const splitTransactionDataExtraFields = async (
  data: TransactionData,
  userId: string
): Promise<{ standard: TransactionData; extra: Prisma.InputJsonValue }> => {
  const fields = await getFields(userId)
  const fieldMap = fields.reduce(
    (acc, field) => {
      acc[field.code] = field
      return acc
    },
    {} as Record<string, Field>
  )

  const standard: TransactionData = {}
  const extra: Record<string, unknown> = {}

  Object.entries(data).forEach(([key, value]) => {
    const fieldDef = fieldMap[key]
    if (fieldDef && !COMPUTED_FIELD_CODES.has(key)) {
      if (fieldDef.isExtra) {
        extra[key] = value
      } else {
        standard[key] = value
      }
    }
  })

  return { standard, extra: extra as Prisma.InputJsonValue }
}
