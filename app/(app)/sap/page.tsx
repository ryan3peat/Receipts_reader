import { ReconciliationView } from "@/components/reconciliation/reconciliation-view"
import { StatementForm } from "@/components/sap/statement-form"
import { getActor } from "@/lib/access"
import { getCurrentUser } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { parseThresholds, RECENT_MONTHS, windowStart } from "@/lib/reconciliation"
import { latestPurchaseMonth, statementSummaries } from "@/models/reconciliation"
import { getSettings } from "@/models/settings"
import { Metadata } from "next"
import { redirect } from "next/navigation"

// The statement upload runs on this page, and reading a long scanned statement takes a few minutes.
export const maxDuration = 300

export const metadata: Metadata = {
  title: "Reconciliations",
  description: "Check every card statement has its receipts, then export it for SAP",
}

export default async function SapPage() {
  const actor = await getActor()
  if (actor.effectiveRole !== "accounts") redirect("/dashboard")
  const user = await getCurrentUser()

  // Only the latest months are read here, as counts. Older months and each statement's lines are fetched afterwards.
  const [settings, latest, employees] = await Promise.all([
    getSettings(user.id),
    latestPurchaseMonth(user.id),
    prisma.user.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true, employeeCode: true, cardNumber: true },
    }),
  ])
  const cutoff = latest ? windowStart(latest, RECENT_MONTHS) : null
  const recent = await statementSummaries(user.id, cutoff ? { from: cutoff } : {})

  return (
    <div className="flex flex-col gap-6 p-4">
      <header>
        <h2 className="text-3xl font-bold tracking-tight">Reconciliations</h2>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Each card statement should have a receipt for every purchase. Work through the incomplete ones, and export a
          statement for SAP once it is green.
        </p>
      </header>

      <details className="rounded-md border p-4">
        <summary className="cursor-pointer text-sm font-medium">Upload a credit card statement</summary>
        <div className="mt-4">
          <StatementForm employees={employees} />
        </div>
      </details>

      <ReconciliationView
        initialStatements={recent}
        olderBefore={cutoff}
        initialThresholds={parseThresholds(settings)}
      />
    </div>
  )
}
