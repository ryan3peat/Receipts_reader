"use client"

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useTransactionFilters } from "@/hooks/use-transaction-filters"

export function SubmitterFilter({ people }: { people: { id: string; name: string; email: string }[] }) {
  const [filters, setFilters] = useTransactionFilters()

  return (
    <Select
      value={filters.submittedById || "all"}
      onValueChange={(value) => setFilters((prev) => ({ ...prev, submittedById: value === "all" ? "" : value }))}
    >
      <SelectTrigger className="w-48">
        <SelectValue placeholder="Everyone" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">Everyone</SelectItem>
        {people.map((person) => (
          <SelectItem key={person.id} value={person.id}>
            {person.name || person.email}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
