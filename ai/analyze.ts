"use server"

import { ActionState } from "@/lib/actions"
import { prisma } from "@/lib/db"
import { updateFile } from "@/models/files"
import { getLLMSettings, getSettings } from "@/models/settings"
import { AnalyzeAttachment } from "./attachments"
import { requestLLM } from "./providers/llmProvider"

export type AnalysisResult = {
  output: Record<string, string>
  tokensUsed: number
}

export async function analyzeTransaction(
  prompt: string,
  schema: Record<string, unknown>,
  attachments: AnalyzeAttachment[],
  fileId: string,
  userId: string
): Promise<ActionState<AnalysisResult>> {
  const settings = await getSettings(userId)
  const llmSettings = getLLMSettings(settings)

  try {
    const response = await requestLLM(llmSettings, {
      prompt,
      schema,
      attachments,
    })

    if (response.error) {
      throw new Error(response.error)
    }

    const result = response.output
    const tokensUsed = response.tokensUsed || 0
    await keepOwnedCodes(userId, result)

    console.log("LLM response:", result)
    console.log("LLM tokens used:", tokensUsed)

    await updateFile(fileId, userId, { cachedParseResult: result })

    return {
      success: true,
      data: {
        output: result,
        tokensUsed: tokensUsed,
      },
    }
  } catch (error) {
    console.error("AI Analysis error:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to analyze invoice",
    }
  }
}

async function keepOwnedCodes(userId: string, result: Record<string, string>) {
  for (const model of ["category", "project"] as const) {
    const key = model === "category" ? "categoryCode" : "projectCode"
    const value = result[key]
    if (!value) continue
    const match = { userId, OR: [{ code: value }, { name: { equals: value, mode: "insensitive" as const } }] }
    const row =
      model === "category"
        ? await prisma.category.findFirst({ where: match })
        : await prisma.project.findFirst({ where: match })
    if (row) result[key] = row.code
    else delete result[key]
  }
}
