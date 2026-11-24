"use server"

import { printedPages, readOnePage, renderStatementPages } from "@/ai/statement"
import { requireAccounts } from "@/lib/access"
import { getCurrentUser } from "@/lib/auth"
import { unsortedFilePath } from "@/lib/files"
import { assembleStatement, type HolderCheck } from "@/lib/sap"
import { createFile, getFileById, readFileBytes, updateFile } from "@/models/files"
import { getLLMSettings, getSettings } from "@/models/settings"
import { saveCombinedStatement } from "@/models/statement-import"
import { prisma } from "@/lib/db"
import { randomUUID } from "crypto"
import { revalidatePath } from "next/cache"

export type StatementImportResult = {
  success: boolean
  error?: string
  holders?: { name: string; card: string; period: string; lines: number; missing: number; emailed: boolean }[]
  unmatched?: { accountName: string; accountNumber: string; lineCount: number }[]
  checks?: HolderCheck[]
}

export type StatementStartResult =
  | { success: true; fileId: string; pageCount: number; printedPages: number[] }
  | { success: false; error: string }

export type StatementPageResult = { success: true; lines: number } | { success: false; error: string }

// Progress is kept on the stored statement, so a page read survives a reload and the upload can resume.
type StatementState = { printedPages: number[]; read: Record<string, unknown[]> }

function readState(value: unknown): StatementState | null {
  if (!value || typeof value !== "object") return null
  const stored = value as { printedPages?: unknown; read?: unknown }
  if (!Array.isArray(stored.printedPages)) return null
  const read = stored.read && typeof stored.read === "object" ? (stored.read as Record<string, unknown[]>) : {}
  return { printedPages: stored.printedPages.map((page) => Number(page)), read }
}

// Step 1: the PDF is turned upright, rendered, and its printed pages are found. Nothing is saved until this works.
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
  let printed: number[]
  try {
    const pages = await renderStatementPages(bytes)
    pageCount = pages.length
    printed = (await printedPages(pages)).map((page) => page.page)
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Could not read the statement" }
  }
  if (printed.length === 0) return { success: false, error: "No printed pages were found in that statement" }

  const fileId = randomUUID()
  await createFile(user.id, {
    id: fileId,
    filename,
    path: unsortedFilePath(fileId, filename),
    mimetype: "application/pdf",
    isReviewed: true,
    metadata: { kind: "card-statement" },
    cachedParseResult: { printedPages: printed, read: {} },
    content: bytes,
  })
  return { success: true, fileId, pageCount, printedPages: printed }
}

// Step 2: one page is rendered and read. Called once per printed page, one after another.
export async function readStatementPageAction(fileId: string, page: number): Promise<StatementPageResult> {
  const gate = await requireAccounts()
  if (!gate.ok) return { success: false, error: gate.error }

  const user = await getCurrentUser()
  const file = await getFileById(fileId, user.id)
  const state = readState(file?.cachedParseResult)
  const isStatement = (file?.metadata as { kind?: string } | null)?.kind === "card-statement"
  if (!file || !state || !isStatement || !state.printedPages.includes(page)) {
    return { success: false, error: "That statement is not waiting to be read. Upload it again." }
  }

  const bytes = await readFileBytes(file.id)
  if (!bytes) return { success: false, error: "The statement could not be found. Upload it again." }

  let entries: unknown[]
  try {
    const settings = await getSettings(user.id)
    entries = await readOnePage(getLLMSettings(settings), bytes, page, file.filename)
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Could not read the page" }
  }

  state.read[String(page)] = entries
  await updateFile(file.id, user.id, { cachedParseResult: { printedPages: state.printedPages, read: state.read } })
  return { success: true, lines: entries.length }
}

// Step 3: every printed page is read, so the cards are split out, saved against their people, and checked.
export async function finishStatementAction(fileId: string): Promise<StatementImportResult> {
  const gate = await requireAccounts()
  if (!gate.ok) return { success: false, error: gate.error }

  const user = await getCurrentUser()
  const file = await getFileById(fileId, user.id)
  const state = readState(file?.cachedParseResult)
  if (!file || !state) return { success: false, error: "That statement is not waiting to be read. Upload it again." }

  const unread = state.printedPages.filter((page) => !(String(page) in state.read))
  if (unread.length > 0) {
    return { success: false, error: `${unread.length} page${unread.length === 1 ? " has" : "s have"} not been read yet: ${unread.join(", ")}` }
  }

  const combined = assembleStatement(state.printedPages.flatMap((page) => state.read[String(page)] ?? []))
  if (combined.sections.every((section) => section.billing || section.lines.length === 0)) {
    return { success: false, error: "No card transactions were found on that statement" }
  }

  const people = await prisma.user.findMany({ select: { id: true, name: true, email: true, cardNumber: true } })
  const saved = await saveCombinedStatement({
    ownerId: user.id,
    fileId: file.id,
    filename: file.filename,
    combined,
    people: people.map((person) => ({ id: person.id, name: person.name, cardNumber: person.cardNumber })),
  })

  // Emails are not sent by this import yet. People see their missing receipts on their home screen.
  const holders: NonNullable<StatementImportResult["holders"]> = saved.imported.map((held) => ({
    name: held.employeeName,
    card: held.accountNumber,
    period: held.periodLabel,
    lines: held.lineCount,
    missing: held.missing.length,
    emailed: false,
  }))

  revalidatePath("/sap")
  revalidatePath("/dashboard")
  return { success: true, holders, unmatched: saved.unmatched, checks: saved.checks }
}