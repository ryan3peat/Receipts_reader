import {
  checkStatement,
  matchCardholder,
  matchStatementLines,
  type Cardholder,
  type CombinedStatement,
  type HolderCheck,
  type StatementPurchase,
} from "@/lib/sap"
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

// Saves one statement per card in a combined PDF, against the person the card belongs to, and works out which
// purchases have no receipt yet. The billing account has no owner, so it is only used to check the totals.
export async function saveCombinedStatement(input: {
  ownerId: string
  fileId: string
  filename: string
  combined: CombinedStatement
  people: Cardholder[]
}): Promise<StatementImport> {
  const imported: ImportedHolder[] = []
  const unmatched: StatementImport["unmatched"] = []

  for (const section of input.combined.sections) {
    if (section.billing || section.lines.length === 0) continue
    const person = matchCardholder(section, input.people)
    if (!person) {
      unmatched.push({
        accountName: section.accountName,
        accountNumber: section.accountNumber,
        lineCount: section.lines.length,
      })
      continue
    }

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

    imported.push({
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
    })
  }

  return { imported, unmatched, checks: checkStatement(input.combined) }
}
