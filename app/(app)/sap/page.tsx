import { StatementForm } from "@/components/sap/statement-form"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { getActor } from "@/lib/access"
import { getCurrentUser } from "@/lib/auth"
import { formatCurrency } from "@/lib/utils"
import { listStatements, rematchStatement } from "@/models/statements"
import { prisma } from "@/lib/db"
import { format } from "date-fns"
import { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"

export const metadata: Metadata = {
  title: "FOR SAP",
  description: "Build the FOR SAP sheet and find card transactions with no receipt",
}

export default async function SapPage() {
  const actor = await getActor()
  if (actor.effectiveRole !== "accounts") redirect("/dashboard")
  const user = await getCurrentUser()
  const employees = await prisma.user.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true, employeeCode: true, cardNumber: true },
  })
  const existing = await listStatements(user.id)
  for (const statement of existing) await rematchStatement(statement.id, user.id)
  const statements = await listStatements(user.id)

  return (
    <div className="flex flex-col gap-6 p-4">
      <header>
        <h2 className="text-3xl font-bold tracking-tight">FOR SAP</h2>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Receipts are read into a GL code from the Essential chart. Upload a cardholder&apos;s credit card statement
          PDF and the sheet is filled from their receipts. Purchases with no receipt are highlighted, and that person
          sees the list on their home screen.
        </p>
      </header>

      <StatementForm employees={employees} />

      {statements.length > 0 && (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Statement</TableHead>
                <TableHead>Period</TableHead>
                <TableHead className="text-right">Missing receipts</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {statements.map((statement) => {
                const missing = statement.lines.filter((line) => line.kind === "purchase" && !line.transactionId)
                return (
                  <TableRow key={statement.id}>
                    <TableCell>{statement.employee.name || statement.employee.email}</TableCell>
                    <TableCell>
                      <div>{statement.filename}</div>
                      <div className="text-xs text-muted-foreground">{format(statement.createdAt, "dd MMM yyyy")}</div>
                    </TableCell>
                    <TableCell>{statement.periodLabel || "-"}</TableCell>
                    <TableCell className="text-right">
                      {missing.length === 0 ? (
                        <span className="text-muted-foreground">0</span>
                      ) : (
                        <span className="rounded bg-yellow-100 px-2 py-0.5 font-medium text-yellow-900">{missing.length}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Link href={`/sap/${statement.id}`} className="underline">
                        Download
                      </Link>
                      {missing.length > 0 && (
                        <ul className="mt-2 max-w-md space-y-1 text-xs text-muted-foreground">
                          {missing.map((line) => (
                            <li key={line.id}>
                              {line.postedOn ? format(line.postedOn, "dd MMM yyyy") : "Unknown date"}: {line.narrative} (
                              {formatCurrency(line.amount, "AUD")})
                            </li>
                          ))}
                        </ul>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
