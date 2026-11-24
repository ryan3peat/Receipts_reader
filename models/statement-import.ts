import { matchStatementLines, type Cardholder, type CombinedStatement, type HolderCheck, type ParsedCardSection, type StatementPurchase } from "@/lib/sap"
import { planSave } from "@/lib/statement-state"
import { receiptsForEmployee, saveCardStatement } from "@/models/statements"

export type ImportedHolder = {
  employeeId: string
  employeeName: string
  accountName: string
  accountNumber: string
  periodLabel: string
  lineCount: number
  purchaseCount: number
  missing: { postedOn: string | null; narrative: string; amountCents: number }[]
}

export type StatementImport = {
  imported: ImportedHolder[]
  // Cards in the PDF that no person could be found for, so nothing was saved for them.
  unmatched: { accountName: string; accountNumber: string; lineCount: number }[]
  checks: HolderCheck[]
}

// Saves one card's statement against the person it belongs to, and works out which purchases have no receipt yet.
// Saving the same card and period again replaces it, so a retry is safe.
export async function saveCardSection(input: {
  ownerId: string
  fileId: string
  filename: string
  section: ParsedCardSection
  person: Cardholder
}): Promise<ImportedHolder> {
  const { section, person } = input
  const receipts = await receiptsForEmployee(input.ownerId, person.id)
  const purchases: StatementPurchase[] = section.lines.map((line, index) => ({
    id: String(index),
    postedOn: line.postedOn,
    narrative: line.narrative,
    amountCents: line.amountCents,
    kind: line.kind,
  }))
  const matches = matchStatementLines(purchases, receipts)
  await saveCardStatement({
    userId: input.ownerId,
    employeeId: person.id,
    fileId: input.fileId,
    filename: input.filename,
    accountName: section.accountName,
    accountNumber: section.accountNumber,
    periodLabel: section.periodLabel,
    lines: section.lines.map((line, index) => ({ ...line, transactionId: matches[index]?.receipt?.id ?? null })),
  })

  return {
    employeeId: person.id,
    employeeName: person.name,
    accountName: section.accountName,
    accountNumber: section.accountNumber,
    periodLabel: section.periodLabel,
    lineCount: section.lines.length,
    purchaseCount: section.lines.filter((line) => line.kind === "purchase").length,
    missing: matches
      .filter((match) => match.line.kind === "purchase" && !match.receipt)
      .map((match) => ({
        postedOn: match.line.postedOn,
        narrative: match.line.narrative,
        amountCents: match.line.amountCents,
      })),
  }
}

// Saves one statement per card in a combined PDF. The billing account has no owner, so it is only used to check the totals.
export async function saveCombinedStatement(input: {
  ownerId: string
  fileId: string
  filename: string
  combined: CombinedStatement
  people: Cardholder[]
}): Promise<StatementImport> {
  const plan = planSave(input.combined, input.people)
  const imported: ImportedHolder[] = []
  for (const target of plan.targets) {
    imported.push(
      await saveCardSection({
        ownerId: input.ownerId,
        fileId: input.fileId,
        filename: input.filename,
        section: target.section,
        person: target.person,
      })
    )
  }
  return { imported, unmatched: plan.unmatched, checks: plan.checks }
}
