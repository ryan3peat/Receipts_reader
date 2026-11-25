"use client"

import {
  finishStatementAction,
  planStatementAction,
  readStatementPageAction,
  saveStatementCardAction,
  startStatementAction,
  type StatementHolder,
  type StatementImportResult,
} from "@/app/(app)/sap/actions"
import { UploadProgress, type Progress } from "@/components/sap/upload-progress"
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
  | { step: "working"; progress: Progress }
  | { step: "done"; result: StatementImportResult }
  | { step: "failed"; error: string }

// A dropped connection rejects instead of returning, so it is turned into an ordinary failure.
async function attempt<T extends { success: boolean }>(call: () => Promise<T>): Promise<T | { success: false; error: string }> {
  try {
    return await call()
  } catch {
    return { success: false, error: "The server could not finish this step. Try the upload again. If it fails the same way, tell me the time so the Vercel logs can be checked." }
  }
}

export function StatementForm({ employees }: { employees: SapEmployee[] }) {
  const [phase, setPhase] = useState<Phase>({ step: "idle" })
  if (employees.length === 0) {
    return <p className="text-sm text-muted-foreground">Add an employee before uploading a statement.</p>
  }

  const busy = phase.step === "working"

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const runStart = Date.now()
    const fail = (error: string) => setPhase({ step: "failed", error })

    // 1. Upload
    setPhase({ step: "working", progress: { stage: "uploading", runStart, stageStart: runStart } })
    const started = await attempt(() => startStatementAction(formData))
    if (!started.success) return fail(started.error)
    const { fileId, pageCount } = started
    const uploadMs = Date.now() - runStart

    // 2. Break out and read each page
    const readStart = Date.now()
    const modelMs: number[] = []
    let blank = 0
    for (let page = 1; page <= pageCount; page++) {
      const pageStart = Date.now()
      let error = ""
      let outcome: { blank: boolean } | null = null
      for (let tries = 1; tries <= ATTEMPTS_PER_PAGE && !outcome; tries++) {
        setPhase({
          step: "working",
          progress: {
            stage: "reading",
            runStart,
            stageStart: readStart,
            uploadMs,
            pageCount,
            page,
            done: page - 1,
            blank,
            attempt: tries,
            attempts: ATTEMPTS_PER_PAGE,
            pageStart: Date.now(),
            modelMs: [...modelMs],
            lastError: error || undefined,
          },
        })
        const result = await attempt(() => readStatementPageAction(fileId, page))
        if (result.success) outcome = result
        else error = result.error
      }
      if (!outcome) return fail(`Page ${page} of ${pageCount} could not be read after ${ATTEMPTS_PER_PAGE} tries. ${error}`)
      if (outcome.blank) blank++
      else modelMs.push(Date.now() - pageStart)
    }
    const readMs = Date.now() - readStart

    // 3. Create one statement per card
    const plan = await attempt(() => planStatementAction(fileId))
    if (!plan.success) return fail(plan.error)

    const saveStart = Date.now()
    const holders: StatementHolder[] = []
    for (let index = 0; index < plan.cards.length; index++) {
      const card = plan.cards[index]
      setPhase({
        step: "working",
        progress: {
          stage: "saving",
          runStart,
          stageStart: saveStart,
          uploadMs,
          readMs,
          pageCount,
          blank,
          done: index,
          total: plan.cards.length,
          current: `${card.name}${card.card ? `, card ${card.card}` : ""}, ${card.lines} transactions`,
        },
      })
      const saved = await attempt(() => saveStatementCardAction(fileId, card.index))
      if (!saved.success) {
        const savedNote = index > 0 ? ` ${index} of ${plan.cards.length} statements were saved.` : ""
        return fail(`Could not create the statement for ${card.name}. ${saved.error}.${savedNote} Upload the PDF again to retry, saved statements are replaced, not doubled.`)
      }
      holders.push(saved.holder)
    }

    await attempt(() => finishStatementAction())
    setPhase({ step: "done", result: { holders, unmatched: plan.unmatched, checks: plan.checks } })
  }

  const flagged = phase.step === "done" ? phase.result.checks.filter((check) => check.ok === false) : []

  return (
    <div className="space-y-6 max-w-3xl">
      <form onSubmit={upload} className="space-y-3 max-w-xl">
        <label className="flex flex-col gap-2 text-sm font-medium">
          Credit card statement PDF
          <span
            className={`flex cursor-pointer flex-col items-start gap-2 rounded-md border-2 border-dashed border-muted-foreground/40 bg-muted/60 px-4 py-5 transition-colors hover:border-primary hover:bg-muted ${busy ? "pointer-events-none opacity-50" : ""}`}
          >
            <span className="text-sm font-medium text-foreground">Choose PDF file</span>
            <span className="text-xs text-muted-foreground">Click here to select the credit card statement</span>
            <Input
              name="statement"
              type="file"
              accept="application/pdf,.pdf"
              required
              disabled={busy}
              className="h-auto cursor-pointer border-0 bg-background/80 p-2 shadow-none file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary-foreground hover:file:bg-primary/90"
            />
          </span>
        </label>
        <p className="text-xs text-muted-foreground">
          One PDF can hold every cardholder. The statement is read one page at a time, then each card is matched to a
          person by card number, then by name, and saved against them.
        </p>
        <Button type="submit" disabled={busy}>
          {busy ? "Working..." : "Upload Statement"}
        </Button>
      </form>

      {phase.step === "working" && <UploadProgress progress={phase.progress} />}

      {phase.step === "failed" && <p className="text-sm text-red-600">{phase.error}</p>}

      {phase.step === "done" && (
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
                {phase.result.holders.map((holder, index) => (
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

          {phase.result.unmatched.length > 0 && (
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
