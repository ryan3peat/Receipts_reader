"use server"

import { requireAccounts } from "@/lib/access"
import { getCurrentUser } from "@/lib/auth"
import {
  GREEN_ABOVE_SETTING,
  RED_BELOW_SETTING,
  validateThresholds,
  type StatementSummary,
  type Thresholds,
} from "@/lib/reconciliation"
import { groupDetail, statementSummaries, type GroupDetail } from "@/models/reconciliation"
import { updateSettings } from "@/models/settings"
import { revalidatePath } from "next/cache"

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_STATEMENTS_PER_OPEN = 8

type Failure = { success: false; error: string }

// Runs after the first screen is showing, so the latest months never wait for the older ones.
export async function loadOlderStatementsAction(
  before: string
): Promise<{ success: true; statements: StatementSummary[] } | Failure> {
  const gate = await requireAccounts()
  if (!gate.ok) return { success: false, error: gate.error }
  if (!MONTH.test(before)) return { success: false, error: "That is not a month" }

  const user = await getCurrentUser()
  return { success: true, statements: await statementSummaries(user.id, { before }) }
}

// Receipts are matched here, for the one statement being opened, and not for every statement on the page.
export async function loadStatementDetailAction(
  statementIds: string[]
): Promise<{ success: true; detail: GroupDetail } | Failure> {
  const gate = await requireAccounts()
  if (!gate.ok) return { success: false, error: gate.error }
  if (
    !Array.isArray(statementIds) ||
    statementIds.length === 0 ||
    statementIds.length > MAX_STATEMENTS_PER_OPEN ||
    !statementIds.every((id) => typeof id === "string" && UUID.test(id))
  ) {
    return { success: false, error: "Those statements could not be opened" }
  }

  const user = await getCurrentUser()
  return { success: true, detail: await groupDetail(user.id, statementIds) }
}

export async function saveThresholdsAction(
  redBelow: number,
  greenAbove: number
): Promise<{ success: true; thresholds: Thresholds } | Failure> {
  const gate = await requireAccounts()
  if (!gate.ok) return { success: false, error: gate.error }
  const problem = validateThresholds(redBelow, greenAbove)
  if (problem) return { success: false, error: problem }

  const user = await getCurrentUser()
  await updateSettings(user.id, RED_BELOW_SETTING, String(redBelow))
  await updateSettings(user.id, GREEN_ABOVE_SETTING, String(greenAbove))
  revalidatePath("/sap")
  return { success: true, thresholds: { redBelow, greenAbove } }
}
