import { Transaction } from "@/prisma/client"

export function omitOwner<T extends object>(data: T): Omit<T, "userId" | "user"> {
  const { userId: _userId, user: _user, ...fields } = data as T & { userId?: unknown; user?: unknown }
  return fields
}

export type ActionState<T> = {
  success: boolean
  error?: string | null
  data?: T | null
  duplicateData?: {
    existingTransaction: Transaction
    newTransactionData: Record<string, unknown>
    resumeIndex?: number
  }
}
