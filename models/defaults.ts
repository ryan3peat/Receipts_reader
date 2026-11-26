import { prisma } from "@/lib/db"
import {
  DEFAULT_CATEGORIES,
  DEFAULT_CURRENCIES,
  DEFAULT_FIELDS,
  DEFAULT_PROJECTS,
  DEFAULT_SETTINGS,
} from "@/models/defaults-data"

export {
  DEFAULT_CATEGORIES,
  DEFAULT_CURRENCIES,
  DEFAULT_FIELDS,
  DEFAULT_PROMPT_ANALYSE_NEW_FILE,
  DEFAULT_PROJECTS,
  DEFAULT_SETTINGS,
} from "@/models/defaults-data"

export async function createUserDefaults(userId: string) {
  // Default projects
  for (const project of DEFAULT_PROJECTS) {
    await prisma.project.upsert({
      where: { userId_code: { code: project.code, userId } },
      update: { name: project.name, color: project.color, llm_prompt: project.llm_prompt },
      create: { ...project, userId },
    })
  }

  // Default categories
  for (const category of DEFAULT_CATEGORIES) {
    await prisma.category.upsert({
      where: { userId_code: { code: category.code, userId } },
      update: { name: category.name, color: category.color, llm_prompt: category.llm_prompt },
      create: { ...category, userId },
    })
  }

  // Default currencies
  for (const currency of DEFAULT_CURRENCIES) {
    await prisma.currency.upsert({
      where: { userId_code: { code: currency.code, userId } },
      update: { name: currency.name },
      create: { ...currency, userId },
    })
  }

  // Default fields
  for (const field of DEFAULT_FIELDS) {
    await prisma.field.upsert({
      where: { userId_code: { code: field.code, userId } },
      update: {
        name: field.name,
        type: field.type,
        llm_prompt: field.llm_prompt,
        isVisibleInList: field.isVisibleInList,
        isVisibleInAnalysis: field.isVisibleInAnalysis,
        isRequired: field.isRequired,
        isExtra: field.isExtra,
      },
      create: { ...field, userId },
    })
  }

  // Default settings
  for (const setting of DEFAULT_SETTINGS) {
    await prisma.setting.upsert({
      where: { userId_code: { code: setting.code, userId } },
      update: { name: setting.name, description: setting.description, value: setting.value },
      create: { ...setting, userId },
    })
  }
}

export async function isDatabaseEmpty(userId: string) {
  const fieldsCount = await prisma.field.count({ where: { userId } })
  return fieldsCount === 0
}

/** Insert default fields added after this account was created. Existing fields are left as the user set them. */
export async function ensureDefaultFields(userId: string) {
  const existing = await prisma.field.findMany({
    where: { userId },
    select: { code: true },
  })
  const have = new Set(existing.map((field) => field.code))

  for (const field of DEFAULT_FIELDS) {
    if (have.has(field.code)) continue
    await prisma.field.upsert({
      where: { userId_code: { code: field.code, userId } },
      update: {},
      create: { ...field, userId },
    })
  }

  // Only rewrite documentKind when an older install still has the hidden defaults.
  const documentKind = await prisma.field.findFirst({
    where: { userId, code: "documentKind" },
    select: { isVisibleInList: true, isVisibleInAnalysis: true },
  })
  if (documentKind && (!documentKind.isVisibleInList || !documentKind.isVisibleInAnalysis)) {
    await prisma.field.updateMany({
      where: { userId, code: "documentKind" },
      data: {
        name: "Document",
        isVisibleInList: true,
        isVisibleInAnalysis: true,
        isExtra: true,
        llm_prompt:
          "What this document is. Return exactly one of: invoice, receipt, payment_confirmation. Use invoice for a tax invoice. Use receipt for a till or purchase receipt. Use payment_confirmation for a payment or bank confirmation that is not a tax invoice.",
      },
    })
  }
}
