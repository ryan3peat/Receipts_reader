"use server"

import { readCardStatement } from "@/ai/statement"
import { requireAccounts } from "@/lib/access"
import { getCurrentUser } from "@/lib/auth"
import { sendMissingReceiptsEmail } from "@/lib/email"
import { unsortedFilePath } from "@/lib/files"
import { formatCurrency } from "@/lib/utils"
import { matchStatementLines, type StatementPurchase } from "@/lib/sap"
import { createFile, getFileById } from "@/models/files"
import { receiptsForEmployee, saveCardStatement } from "@/models/statements"
import { prisma } from "@/lib/db"
import { randomUUID } from "crypto"
import { revalidatePath } from "next/cache"

function displayDay(day: string | null) {
  if (!day) return "Unknown date"
  const [year, month, date] = day.split("-")
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
  return `${Number(date)} ${months[Number(month) - 1] || month} ${year}`
}

export async function importStatementAction(_prev: { success: boolean; error?: string; statementId?: string; emailed?: boolean; missing?: number } | null, formData: FormData) {
  const gate = await requireAccounts()
  if (!gate.ok) return { success: false, error: gate.error }

  const employeeId = String(formData.get("employeeId") || "")
  const employeeCode = String(formData.get("employeeCode") || "").trim()
  const cardNumber = String(formData.get("cardNumber") || "").trim()
  const upload = formData.get("statement")
  if (!(upload instanceof File) || upload.size === 0) return { success: false, error: "Choose the credit card statement PDF" }
  if (upload.type && upload.type !== "application/pdf" && !upload.name.toLowerCase().endsWith(".pdf")) {
    return { success: false, error: "The statement needs to be a PDF" }
  }

  const user = await getCurrentUser()
  const employee = await prisma.user.findUnique({ where: { id: employeeId } })
  if (!employee) return { success: false, error: "Choose an employee" }

  await prisma.user.update({
    where: { id: employee.id },
    data: {
      employeeCode: employeeCode || employee.employeeCode,
      cardNumber: cardNumber || employee.cardNumber,
    },
  })

  const bytes = Buffer.from(await upload.arrayBuffer())
  const fileId = randomUUID()
  const filename = upload.name || "statement.pdf"
  const file = await createFile(user.id, {
    id: fileId,
    filename,
    path: unsortedFilePath(fileId, filename),
    mimetype: "application/pdf",
    isReviewed: true,
    metadata: { kind: "card-statement" },
    content: bytes,
  })

  const stored = await getFileById(file.id, user.id)
  if (!stored) return { success: false, error: "Could not store the statement" }

  let parsed
  try {
    parsed = await readCardStatement(user, stored)
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Could not read the statement" }
  }
  if (parsed.lines.length === 0) {
    return { success: false, error: "No transactions were found on that statement" }
  }

  const receipts = await receiptsForEmployee(user.id, employee.id)
  const purchases: StatementPurchase[] = parsed.lines.map((line, index) => ({
    id: String(index),
    postedOn: line.postedOn,
    narrative: line.narrative,
    amountCents: line.amountCents,
    kind: line.kind,
  }))
  const matches = matchStatementLines(purchases, receipts)
  const statement = await saveCardStatement({
    userId: user.id,
    employeeId: employee.id,
    fileId: file.id,
    filename,
    accountName: parsed.accountName || employee.name,
    accountNumber: parsed.accountNumber || cardNumber || employee.cardNumber || "",
    periodLabel: parsed.periodLabel,
    lines: parsed.lines.map((line, index) => ({
      ...line,
      transactionId: matches[index]?.receipt?.id ?? null,
    })),
  })

  const missing = matches.filter((match) => match.line.kind === "purchase" && !match.receipt)
  const emailed = await sendMissingReceiptsEmail({
    email: employee.email,
    name: employee.name || employee.email,
    lines: missing.map((match) => ({
      when: displayDay(match.line.postedOn),
      narrative: match.line.narrative,
      amount: formatCurrency(match.line.amountCents, "AUD"),
    })),
  })
  if (emailed.sent) {
    await prisma.cardStatement.update({ where: { id: statement.id }, data: { notifiedAt: new Date() } })
  }

  revalidatePath("/sap")
  revalidatePath("/dashboard")
  return { success: true, statementId: statement.id, emailed: emailed.sent, missing: missing.length }
}
