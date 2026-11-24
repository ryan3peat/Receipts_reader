import { formatCurrency } from "@/lib/utils"
import { format } from "date-fns"

export function MissingReceipts({
  lines,
  periodLabel,
}: {
  lines: { id: string; postedOn: Date | null; narrative: string; amount: number }[]
  periodLabel?: string | null
}) {
  if (lines.length === 0) return null
  const total = lines.reduce((sum, line) => sum + line.amount, 0)
  return (
    <section className="rounded-md border border-yellow-200 bg-yellow-50 p-4 text-yellow-950">
      <h3 className="font-semibold">
        {lines.length} card transaction{lines.length === 1 ? "" : "s"} still need a receipt ({formatCurrency(total, "AUD")})
      </h3>
      {periodLabel && <p className="text-sm">Statement: {periodLabel}</p>}
      <ul className="mt-2 space-y-1 text-sm">
        {lines.map((line) => (
          <li key={line.id}>
            {line.postedOn ? format(line.postedOn, "dd MMM yyyy") : "Unknown date"}: {line.narrative} (
            {formatCurrency(line.amount, "AUD")})
          </li>
        ))}
      </ul>
      <p className="mt-2 text-sm">Upload the missing receipt from the home screen.</p>
    </section>
  )
}
