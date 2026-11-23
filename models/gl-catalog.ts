import { prisma } from "@/lib/db"
import { DEFAULT_PROMPT_ANALYSE_NEW_FILE } from "@/models/defaults-data"
import { ESSENTIAL_CATEGORIES, GL_CATALOG_VERSION, LEGACY_CATEGORY_CODES } from "@/models/gl-codes"

const PREVIOUS_PROMPT_START = "You are an accountant and invoice analysis assistant."

const FIELD_UPDATES: Record<string, { name: string; llm_prompt: string; isRequired?: boolean; isVisibleInAnalysis?: boolean }> = {
  categoryCode: {
    name: "GL Code",
    llm_prompt: "Essential GL code. Return exactly one code from: {categories.code}",
    isRequired: true,
    isVisibleInAnalysis: true,
  },
  vat: {
    name: "GST Amount",
    llm_prompt: "GST amount in the receipt currency. Use 0 when the receipt is GST-free.",
    isVisibleInAnalysis: true,
  },
  vat_rate: {
    name: "GST Rate",
    llm_prompt: "Australian GST rate as a percent. Use 10 when GST is charged and 0 when the receipt is GST-free.",
    isVisibleInAnalysis: true,
  },
}

// Idempotent. Existing installs keep custom categories that are not the old generic list.
export async function ensureEssentialCatalog(userId: string) {
  const marker = await prisma.setting.findUnique({
    where: { userId_code: { userId, code: "gl_catalog" } },
  })
  if (marker?.value === GL_CATALOG_VERSION) return

  for (const category of ESSENTIAL_CATEGORIES) {
    await prisma.category.upsert({
      where: { userId_code: { code: category.code, userId } },
      update: { name: category.name, color: category.color, llm_prompt: category.llm_prompt },
      create: { ...category, userId },
    })
  }

  const codes = ESSENTIAL_CATEGORIES.map((category) => category.code)
  await prisma.transaction.updateMany({
    where: { userId, categoryCode: { notIn: codes } },
    data: { categoryCode: null },
  })
  await prisma.category.deleteMany({
    where: { userId, code: { notIn: codes } },
  })

  for (const [code, data] of Object.entries(FIELD_UPDATES)) {
    await prisma.field.updateMany({
      where: { userId, code },
      data,
    })
  }

  const prompt = await prisma.setting.findUnique({
    where: { userId_code: { userId, code: "prompt_analyse_new_file" } },
  })
  if (!prompt || prompt.value?.startsWith(PREVIOUS_PROMPT_START)) {
    await prisma.setting.upsert({
      where: { userId_code: { userId, code: "prompt_analyse_new_file" } },
      update: { value: DEFAULT_PROMPT_ANALYSE_NEW_FILE },
      create: {
        userId,
        code: "prompt_analyse_new_file",
        name: "Prompt for Analyze Transaction",
        description: "Allowed variables: {fields}, {categories}, {categories.code}, {projects}, {projects.code}",
        value: DEFAULT_PROMPT_ANALYSE_NEW_FILE,
      },
    })
  }

  const currency = await prisma.setting.findUnique({
    where: { userId_code: { userId, code: "default_currency" } },
  })
  if (currency?.value === "EUR") {
    await prisma.setting.update({
      where: { userId_code: { userId, code: "default_currency" } },
      data: { value: "AUD" },
    })
  }

  const defaultCategory = await prisma.setting.findUnique({
    where: { userId_code: { userId, code: "default_category" } },
  })
  if (defaultCategory && LEGACY_CATEGORY_CODES.includes(defaultCategory.value || "")) {
    await prisma.setting.update({
      where: { userId_code: { userId, code: "default_category" } },
      data: { value: "" },
    })
  }

  await prisma.setting.upsert({
    where: { userId_code: { userId, code: "gl_catalog" } },
    update: { value: GL_CATALOG_VERSION, name: "GL catalog version" },
    create: {
      userId,
      code: "gl_catalog",
      name: "GL catalog version",
      value: GL_CATALOG_VERSION,
    },
  })
}
