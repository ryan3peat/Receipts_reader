export const TRANSACTION_STATUSES = ["new", "submitted", "matched", "exported"] as const

export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number]

// Matched and Exported are system-set. Accounts can only send a row back to review by hand.
export const MANUAL_TRANSACTION_STATUSES = ["new"] as const

export type ManualTransactionStatus = (typeof MANUAL_TRANSACTION_STATUSES)[number]

export const TRANSACTION_STATUS_LABELS: Record<TransactionStatus, string> = {
  new: "To Review",
  submitted: "Submitted",
  matched: "Matched",
  exported: "Exported",
}

const LEGACY_STATUS_MAP: Record<string, TransactionStatus> = {
  reviewed: "new",
}

export function isTransactionStatus(value: unknown): value is TransactionStatus {
  return typeof value === "string" && (TRANSACTION_STATUSES as readonly string[]).includes(value)
}

export function isManualTransactionStatus(value: unknown): value is ManualTransactionStatus {
  return typeof value === "string" && (MANUAL_TRANSACTION_STATUSES as readonly string[]).includes(value)
}

// Unknown or retired values (e.g. reviewed) read as To Review so they stay visible in filters.
export function toTransactionStatus(value: unknown): TransactionStatus {
  if (typeof value !== "string") return "new"
  if (isTransactionStatus(value)) return value
  return LEGACY_STATUS_MAP[value] ?? "new"
}
