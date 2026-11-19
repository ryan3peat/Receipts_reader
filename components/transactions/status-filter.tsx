"use client"

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useTransactionFilters } from "@/hooks/use-transaction-filters"
import { TRANSACTION_STATUSES, TRANSACTION_STATUS_LABELS } from "@/lib/transaction-status"

export function StatusFilter() {
  const [filters, setFilters] = useTransactionFilters()

  return (
    <Select
      value={filters.status || "all"}
      onValueChange={(value) => setFilters((prev) => ({ ...prev, status: value === "all" ? "" : value }))}
    >
      <SelectTrigger className="w-40">
        <SelectValue placeholder="Any status" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">Any status</SelectItem>
        {TRANSACTION_STATUSES.map((status) => (
          <SelectItem key={status} value={status}>
            {TRANSACTION_STATUS_LABELS[status]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
