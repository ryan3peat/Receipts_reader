export const TRANSACTION_STATUSES = ["new", "reviewed", "exported"] as const

export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number]

// "exported" is set by an SAP export batch, never by hand, so it cannot drift from what was actually exported.
export const MANUAL_TRANSACTION_STATUSES = ["new", "reviewed"] as const

export type ManualTransactionStatus = (typeof MANUAL_TRANSACTION_STATUSES)[number]

export const TRANSACTION_STATUS_LABELS: Record<TransactionStatus, string> = {
  new: "To review",
  reviewed: "Reviewed",
  exported: "Exported",
}

export function isTransactionStatus(value: unknown): value is TransactionStatus {
  return typeof value === "string" && (TRANSACTION_STATUSES as readonly string[]).includes(value)
}

export function isManualTransactionStatus(value: unknown): value is ManualTransactionStatus {
  return typeof value === "string" && (MANUAL_TRANSACTION_STATUSES as readonly string[]).includes(value)
}

// Unknown values read as "new" so a bad row is shown as still needing review rather than hidden.
export function toTransactionStatus(value: unknown): TransactionStatus {
  return isTransactionStatus(value) ? value : "new"
}
