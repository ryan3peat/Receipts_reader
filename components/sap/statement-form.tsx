"use client"

import {
  finishStatementAction,
  readStatementPageAction,
  startStatementAction,
  type StatementImportResult,
} from "@/app/(app)/sap/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { formatCurrency } from "@/lib/utils"
import { useState, type FormEvent } from "react"

export type SapEmployee = {
  id: string
  name: string
  email: string
  employeeCode: string | null
  cardNumber: string | null
}

// Each page is one request, and a page that fails is tried again before the upload stops.
const ATTEMPTS_PER_PAGE = 3

type Phase =
  | { step: "idle" }
  | { step: "preparing" }
  | { step: "reading"; done: number; total: number; page: number }
  | { step: "finishing" }
  | { step: "done"; result: StatementImportResult }
  | { step: "failed"; error: string }

export function StatementForm({ employees }: { employees: SapEmployee[] }) {
  const [phase, setPhase] = useState<Phase>({ step: "idle" })
  if (employees.length === 0) {
    return <p className="text-sm text-muted-foreground">Add an employee before uploading a statement.</p>
  }

  const busy = phase.step === "preparing" || phase.step === "reading" || phase.step === "finishing"

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    setPhase({ step: "preparing" })

    const started = await startStatementAction(formData)
    if (!started.success) return setPhase({ step: "failed", error: started.error })

    const pages = started.printedPages
    for (let index = 0; index < pages.length; index++) {
      const page = pages[index]
      setPhase({ step: "reading", done: index, total: pages.length, page })
      let error = ""
      let read = false
      for (let attempt = 0; attempt < ATTEMPTS_PER_PAGE && !read; attempt++) {
        const result = await readStatementPageAction(started.fileId, page)
        if (result.success) read = true
        else error = result.error
      }
      if (!read) {
        return setPhase({ step: "failed", error: `Page ${page} could not be read after ${ATTEMPTS_PER_PAGE} tries. ${error}` })
      }
    }

    setPhase({ step: "finishing" })
    const result = await finishStatementAction(started.fileId)
    setPhase(result.success ? { step: "done", result } : { step: "failed", error: result.error ?? "Could not save the statement" })
  }

  const flagged = phase.step === "done" ? phase.result.checks?.filter((check) => check.ok === false) ?? [] : []

  return (
    <div className="space-y-6 max-w-3xl">
      <form onSubmit={upload} className="space-y-3 max-w-xl">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Credit card statement PDF
          <Input name="statement" type="file" accept="application/pdf,.pdf" required disabled={busy} />
        </label>
        <p className="text-xs text-muted-foreground">
          One PDF can hold every cardholder. The statement is read one page at a time, then each card is matched to a
          person by card number, then by name, and saved against them.
        </p>
        <Button type="submit" disabled={busy}>
          {busy ? "Reading statement..." : "Read statement and find missing receipts"}
        </Button>
      </form>

      {phase.step === "preparing" && <p className="text-sm text-muted-foreground">Preparing the statement pages...</p>}

      {phase.step === "reading" && (
        <div className="space-y-2 text-sm">
          <p>
            Reading page {phase.page} ({phase.done + 1} of {phase.total})
          </p>
          <div className="h-2 w-full overflow-hidden rounded bg-muted">
            <div className="h-2 bg-primary transition-all" style={{ width: `${(phase.done / phase.total) * 100}%` }} />
          </div>
        </div>
      )}

      {phase.step === "finishing" && <p className="text-sm text-muted-foreground">Matching cards to people and saving...</p>}

      {phase.step === "failed" && <p className="text-sm text-red-600">{phase.error}</p>}

      {phase.step === "done" && phase.result.success && (
        <div className="space-y-3 text-sm">
          <div className="rounded-md border">
            <table className="w-full text-left">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="p-2">Person</th>
                  <th className="p-2">Card</th>
                  <th className="p-2 text-right">Transactions</th>
                  <th className="p-2 text-right">Waiting for a receipt</th>
                </tr>
              </thead>
              <tbody>
                {phase.result.holders?.map((holder, index) => (
                  <tr key={`${holder.card}-${index}`} className="border-t">
                    <td className="p-2">{holder.name}</td>
                    <td className="p-2">{holder.card || "-"}</td>
                    <td className="p-2 text-right">{holder.lines}</td>
                    <td className="p-2 text-right">{holder.missing}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {phase.result.unmatched && phase.result.unmatched.length > 0 && (
            <div className="rounded-md border border-yellow-200 bg-yellow-50 p-3 text-yellow-950">
              <p className="font-medium">No person found for these cards, so nothing was saved for them:</p>
              <ul className="mt-1 list-disc pl-5">
                {phase.result.unmatched.map((card, index) => (
                  <li key={`${card.accountNumber}-${index}`}>
                    {card.accountName || "Unnamed"} {card.accountNumber && `(${card.accountNumber})`}, {card.lineCount}{" "}
                    transactions
                  </li>
                ))}
              </ul>
              <p className="mt-1">Add the card number to the person on the People page and upload the PDF again.</p>
            </div>
          )}

          {flagged.length > 0 && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-red-950">
              <p className="font-medium">These cardholders do not add up to the total printed on their statement pages:</p>
              <ul className="mt-1 list-disc pl-5">
                {flagged.map((check) => (
                  <li key={check.key}>
                    {check.name}: read {formatCurrency(check.purchasesCents, "AUD")} of purchases
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-muted-foreground">
            Emails are not sent by this import. People see their missing receipts on their home screen.
          </p>
        </div>
      )}
    </div>
  )
}
