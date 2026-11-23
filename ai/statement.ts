import { loadAttachmentsForAI } from "@/ai/attachments"
import { requestLLM } from "@/ai/providers/llmProvider"
import { parseStatementOutput, type ParsedStatement } from "@/lib/sap"
import { getLLMSettings, getSettings } from "@/models/settings"
import type { File, User } from "@/prisma/client"

const STATEMENT_PROMPT = `You read an Australian credit card statement.
Return every transaction line. Skip headers, opening balance, closing balance, and running balance.
date is YYYY-MM-DD.
narrative is the bank description, unchanged.
amount is the transaction value in dollars and is always positive.
kind is purchase for card spending, payment for money paid onto the card, fee for a card fee, or refund for money returned to the card.
accountName is the cardholder name. accountNumber is the card number. period is the statement period as printed.`

const STATEMENT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    accountName: { type: "string" },
    accountNumber: { type: "string" },
    period: { type: "string" },
    lines: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          date: { type: "string" },
          narrative: { type: "string" },
          amount: { type: "number" },
          kind: { type: "string" },
        },
        required: ["date", "narrative", "amount", "kind"],
      },
    },
  },
  required: ["accountName", "accountNumber", "period", "lines"],
}

export async function readCardStatement(user: User, file: File): Promise<ParsedStatement> {
  const settings = await getSettings(user.id)
  const attachments = await loadAttachmentsForAI(user, file, 8)
  const response = await requestLLM(getLLMSettings(settings), {
    prompt: STATEMENT_PROMPT,
    schema: STATEMENT_SCHEMA,
    attachments,
  })
  if (response.error) throw new Error(response.error)
  return parseStatementOutput(response.output as unknown as Record<string, unknown>)
}
