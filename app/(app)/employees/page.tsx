import { FiltersWidget } from "@/components/dashboard/filters-widget"
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { getActor } from "@/lib/access"
import { getCurrentUser } from "@/lib/auth"
import { EmployeeSummary, totalEmployeeSummaries } from "@/lib/employee-summary"
import { TRANSACTION_STATUSES, TRANSACTION_STATUS_LABELS, type TransactionStatus } from "@/lib/transaction-status"
import { cn, formatCurrency } from "@/lib/utils"
import { getEmployeeSummaries } from "@/models/employees"
import { format } from "date-fns"
import { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"

export const metadata: Metadata = {
  title: "Employees",
  description: "Receipts uploaded by each employee",
}

const DAY = /^\d{4}-\d{2}-\d{2}$/

function Totals({ totals }: { totals: Record<string, number> }) {
  const entries = Object.entries(totals)
  if (entries.length === 0) return <span className="text-muted-foreground">-</span>
  return (
    <div className="flex flex-col">
      {entries.map(([currency, amount]) => (
        <span key={currency}>{formatCurrency(amount, currency)}</span>
      ))}
    </div>
  )
}

function Count({ value, warn, href }: { value: number; warn?: boolean; href?: string }) {
  if (value === 0) return <span className="text-muted-foreground">0</span>
  const className = cn("font-medium", warn && "rounded bg-yellow-100 px-2 py-0.5 text-yellow-900")
  return href ? (
    <Link href={href} className={cn(className, "underline")}>
      {value}
    </Link>
  ) : (
    <span className={className}>{value}</span>
  )
}

export default async function EmployeesPage({
  searchParams,
}: {
  searchParams: Promise<{ dateFrom?: string; dateTo?: string }>
}) {
  const [user, actor, params] = await Promise.all([getCurrentUser(), getActor(), searchParams])
  if (actor.effectiveRole !== "accounts") redirect("/dashboard")

  const period = {
    dateFrom: params.dateFrom && DAY.test(params.dateFrom) ? params.dateFrom : undefined,
    dateTo: params.dateTo && DAY.test(params.dateTo) ? params.dateTo : undefined,
  }
  const rows = await getEmployeeSummaries(user.id, period)
  const totals = totalEmployeeSummaries(rows)

  const receiptsHref = (row: EmployeeSummary, status?: TransactionStatus) => {
    if (!row.id) return undefined
    const query = new URLSearchParams({ submittedById: row.id })
    if (period.dateFrom) query.set("dateFrom", period.dateFrom)
    if (period.dateTo) query.set("dateTo", period.dateTo)
    if (status) query.set("status", status)
    return `/transactions?${query.toString()}`
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <header className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <h2 className="flex flex-row gap-3 md:gap-5">
          <span className="text-3xl font-bold tracking-tight">Employees</span>
          <span className="text-3xl tracking-tight opacity-20">{rows.filter((row) => row.id).length}</span>
        </h2>
        <FiltersWidget defaultFilters={period} defaultRange="all-time" />
      </header>

      <p className="text-sm text-muted-foreground">
        Receipts are counted by receipt date in the selected period. Waiting in Unsorted is the current backlog,
        whatever the period.
      </p>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead className="text-right">Receipts</TableHead>
              {TRANSACTION_STATUSES.map((status) => (
                <TableHead key={status} className="text-right">
                  {TRANSACTION_STATUS_LABELS[status]}
                </TableHead>
              ))}
              <TableHead className="text-right">Expenses</TableHead>
              <TableHead className="text-right">Incomplete</TableHead>
              <TableHead className="text-right">No file attached</TableHead>
              <TableHead className="text-right">Waiting in Unsorted</TableHead>
              <TableHead className="text-right">Last upload</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const href = receiptsHref(row)
              return (
                <TableRow key={row.id ?? "unassigned"}>
                  <TableCell>
                    <div className="flex flex-col">
                      {href ? (
                        <Link href={href} className="font-medium underline">
                          {row.name}
                        </Link>
                      ) : (
                        <span className="font-medium">{row.name}</span>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {row.id ? row.email : "No submitter recorded"}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Count value={row.receipts} href={href} />
                  </TableCell>
                  {TRANSACTION_STATUSES.map((status) => (
                    <TableCell key={status} className="text-right">
                      <Count
                        value={row.statusCounts[status]}
                        warn={status === "new"}
                        href={receiptsHref(row, status)}
                      />
                    </TableCell>
                  ))}
                  <TableCell className="text-right">
                    <Totals totals={row.expenseTotals} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Count value={row.incomplete} warn />
                  </TableCell>
                  <TableCell className="text-right">
                    <Count value={row.withoutFile} warn />
                  </TableCell>
                  <TableCell className="text-right">
                    <Count
                      value={row.pendingFiles}
                      warn
                      href={row.id ? `/unsorted?submittedById=${row.id}` : undefined}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    {row.lastUploadAt ? (
                      format(row.lastUploadAt, "yyyy-MM-dd")
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell>Total</TableCell>
              <TableCell className="text-right">{totals.receipts}</TableCell>
              {TRANSACTION_STATUSES.map((status) => (
                <TableCell key={status} className="text-right">
                  {totals.statusCounts[status]}
                </TableCell>
              ))}
              <TableCell className="text-right">
                <Totals totals={totals.expenseTotals} />
              </TableCell>
              <TableCell className="text-right">{totals.incomplete}</TableCell>
              <TableCell className="text-right">{totals.withoutFile}</TableCell>
              <TableCell className="text-right">{totals.pendingFiles}</TableCell>
              <TableCell></TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </div>
    </div>
  )
}
