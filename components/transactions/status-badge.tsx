import { Badge } from "@/components/ui/badge"
import { TRANSACTION_STATUS_LABELS, toTransactionStatus, type TransactionStatus } from "@/lib/transaction-status"
import { cn } from "@/lib/utils"

const styles: Record<TransactionStatus, string> = {
  new: "border-amber-200 bg-amber-50 text-amber-900",
  submitted: "border-sky-200 bg-sky-50 text-sky-900",
  matched: "border-blue-200 bg-blue-50 text-blue-900",
  exported: "border-green-200 bg-green-50 text-green-900",
}

export function StatusBadge({ status }: { status: string | null | undefined }) {
  const value = toTransactionStatus(status)
  return (
    <Badge variant="outline" className={cn("whitespace-nowrap", styles[value])}>
      {TRANSACTION_STATUS_LABELS[value]}
    </Badge>
  )
}
