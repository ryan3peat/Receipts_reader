"use server"

import { pageCountOf, readOnePage } from "@/ai/statement"
import { requireAccounts } from "@/lib/access"
import { getCurrentUser } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { unsortedFilePath } from "@/lib/files"
import { assembleStatement, type CombinedStatement, type HolderCheck } from "@/lib/sap"
import { hasCardLines, pagesLeft, planSave, readEntries, readState, type StatementState } from "@/lib/statement-state"
import { createFile, getFileById, readFileBytes, updateFile } from "@/models/files"
import { getLLMSettings, getSettings } from "@/models/settings"
import { saveCardSection } from "@/models/statement-import"
import { randomUUID } from "crypto"
import { revalidatePath } from "next/cache"

export type StatementStartResult = { success: true; fileId: string; pageCount: number } | { success: false; error: string }

export type StatementPageResult = { success: true; blank: boolean; lines: number } | { success: false; error: string }

export type StatementPlanResult =
  | {
      success: true
      // One entry per card that will be saved, in order. `index` is what the save step is called with.
      cards: { index: number; name: string; card: string; period: string; lines: number }[]
      unmatched: { accountName: string; accountNumber: string; lineCount: number }[]
      checks: HolderCheck[]
    }
  | { success: false; error: string }

export type StatementHolder = { name: string; card: string; period: string; lines: number; missing: number }

export type StatementSaveResult = { success: true; holder: StatementHolder } | { success: false; error: string }

export type StatementImportResult = {
  holders: StatementHolder[]
  unmatched: { accountName: string; accountNumber: string; lineCount: number }[]
  checks: HolderCheck[]
}

const NOT_WAITING = "That statement is not waiting to be read. Upload it again."

type LoadedStatement = { userId: string; fileId: string; filename: string; state: StatementState }

async function loadStatement(fileId: string): Promise<LoadedStatement | { error: string }> {
  const gate = await requireAccounts()
  if (!gate.ok) return { error: gate.error }
  const user = await getCurrentUser()
  const file = await getFileById(fileId, user.id)
  const state = readState(file?.cachedParseResult)
  const isStatement = (file?.metadata as { kind?: string } | null)?.kind === "card-statement"
  if (!file || !state || !isStatement) return { error: NOT_WAITING }
  return { userId: user.id, fileId: file.id, filename: file.filename, state }
}

// Rebuilds the cards from the pages read so far. Each save request does this, so none depends on another's memory.
async function combinedFor(statement: LoadedStatement): Promise<{ error: string } | { combined: CombinedStatement }> {
  const left = pagesLeft(statement.state)
  if (left.length > 0) {
    return { error: `${left.length} page${left.length === 1 ? " has" : "s have"} not been read yet: ${left.join(", ")}` }
  }
  const combined = assembleStatement(readEntries(statement.state))
  if (!hasCardLines(combined)) return { error: "No card transactions were found on that statement" }
  return { combined }
}

async function cardholders() {
  const people = await prisma.user.findMany({ select: { id: true, name: true, cardNumber: true } })
  return people.map((person) => ({ id: person.id, name: person.name, cardNumber: person.cardNumber }))
}

// Step 1: the PDF is validated and stored, and its pages are counted. Pages are rendered one at a time in step 2.
export async function startStatementAction(formData: FormData): Promise<StatementStartResult> {
  const gate = await requireAccounts()
  if (!gate.ok) return { success: false, error: gate.error }

  const upload = formData.get("statement")
  if (!(upload instanceof File) || upload.size === 0) return { success: false, error: "Choose the credit card statement PDF" }
  if (upload.type && upload.type !== "application/pdf" && !upload.name.toLowerCase().endsWith(".pdf")) {
    return { success: false, error: "The statement needs to be a PDF" }
  }

  const user = await getCurrentUser()
  const bytes = Buffer.from(await upload.arrayBuffer())
  const filename = upload.name || "statement.pdf"

  let pageCount: number
  try {
    pageCount = await pageCountOf(bytes)
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Could not read the statement" }
  }

  const fileId = randomUUID()
  await createFile(user.id, {
    id: fileId,
    filename,
    path: unsortedFilePath(fileId, filename),
    mimetype: "application/pdf",
    isReviewed: true,
    metadata: { kind: "card-statement" },
    cachedParseResult: { pageCount, blank: [], read: {} } satisfies StatementState,
    content: bytes,
  })
  return { success: true, fileId, pageCount }
}

// Step 2: one page is rendered, then skipped if blank or read. Called once per page, one after another.
export async function readStatementPageAction(fileId: string, page: number): Promise<StatementPageResult> {
  const statement = await loadStatement(fileId)
  if ("error" in statement) return { success: false, error: statement.error }
  const { state } = statement
  if (!Number.isInteger(page) || page < 1 || page > state.pageCount) return { success: false, error: NOT_WAITING }

  // A page already done is not done again, so a retry after a dropped connection costs nothing.
  if (state.blank.includes(page)) return { success: true, blank: true, lines: 0 }
  const done = state.read[String(page)]
  if (done) return { success: true, blank: false, lines: done.length }

  const bytes = await readFileBytes(statement.fileId)
  if (!bytes) return { success: false, error: "The statement could not be found. Upload it again." }

  let result: Awaited<ReturnType<typeof readOnePage>>
  try {
    const settings = await getSettings(statement.userId)
    result = await readOnePage(getLLMSettings(settings), bytes, page, statement.filename)
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Could not read the page" }
  }

  if (result.blank) state.blank.push(page)
  else state.read[String(page)] = result.entries
  await updateFile(statement.fileId, statement.userId, { cachedParseResult: state })
  return { success: true, blank: result.blank, lines: result.blank ? 0 : result.entries.length }
}

// Step 3: every page is done, so the cards are split out and matched to people. Nothing is saved yet.
export async function planStatementAction(fileId: string): Promise<StatementPlanResult> {
  const statement = await loadStatement(fileId)
  if ("error" in statement) return { success: false, error: statement.error }
  const built = await combinedFor(statement)
  if ("error" in built) return { success: false, error: built.error }

  const plan = planSave(built.combined, await cardholders())
  return {
    success: true,
    cards: plan.targets.map((target) => ({
      index: target.index,
      name: target.person.name,
      card: target.section.accountNumber,
      period: target.section.periodLabel,
      lines: target.section.lines.length,
    })),
    unmatched: plan.unmatched,
    checks: plan.checks,
  }
}

// Step 4: one card is saved against its person. Saving the same card again replaces it.
export async function saveStatementCardAction(fileId: string, index: number): Promise<StatementSaveResult> {
  const statement = await loadStatement(fileId)
  if ("error" in statement) return { success: false, error: statement.error }
  const built = await combinedFor(statement)
  if ("error" in built) return { success: false, error: built.error }

  const target = planSave(built.combined, await cardholders()).targets.find((item) => item.index === index)
  if (!target) return { success: false, error: "That card is not part of this statement" }

  const saved = await saveCardSection({
    ownerId: statement.userId,
    fileId: statement.fileId,
    filename: statement.filename,
    section: target.section,
    person: target.person,
  })
  // Emails are not sent by this import yet. People see their missing receipts on their home screen.
  return {
    success: true,
    holder: {
      name: saved.employeeName,
      card: saved.accountNumber,
      period: saved.periodLabel,
      lines: saved.lineCount,
      missing: saved.missing.length,
    },
  }
}

// Step 5: refreshes the screens that show statements. Done once, so the page does not reload after every card.
export async function finishStatementAction(): Promise<{ success: boolean }> {
  const gate = await requireAccounts()
  if (!gate.ok) return { success: false }
  revalidatePath("/sap")
  revalidatePath("/dashboard")
  return { success: true }
}
