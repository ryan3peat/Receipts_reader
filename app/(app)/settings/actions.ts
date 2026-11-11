"use server"

import { LLMConfig, LLMProvider, testLLMProvider } from "@/ai/providers/llmProvider"
import {
  categoryFormSchema,
  currencyFormSchema,
  fieldFormSchema,
  projectFormSchema,
  settingsFormSchema,
} from "@/forms/settings"
import { userFormSchema } from "@/forms/users"
import { ActionState } from "@/lib/actions"
import { requireAccounts } from "@/lib/access"
import { getCurrentUser } from "@/lib/auth"
import config from "@/lib/config"
import { uploadStaticImage } from "@/lib/uploads"
import { codeFromName, randomHexColor } from "@/lib/utils"
import { createCategory, deleteCategory, updateCategory } from "@/models/categories"
import { createCurrency, deleteCurrency, updateCurrency } from "@/models/currencies"
import { createField, deleteField, updateField } from "@/models/fields"
import { createProject, deleteProject, updateProject } from "@/models/projects"
import { SELF_HOSTED_ONLY_SETTINGS, SettingsMap, updateSettings } from "@/models/settings"
import { getUserByEmail, updateUser } from "@/models/users"
import { Prisma, User } from "@/prisma/client"
import { revalidatePath } from "next/cache"
import path from "path"

const SELF_HOSTED_ONLY_SETTINGS_SET = new Set<string>(SELF_HOSTED_ONLY_SETTINGS)

async function accountsOnly() {
  const gate = await requireAccounts()
  if (!gate.ok) return { success: false as const, error: gate.error }
  return null
}

function isMissingRecord(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("code" in error)) return false
  return (error as { code?: unknown }).code === "P2025"
}

function ownedWriteError(verb: "update" | "delete", record: string, error: unknown) {
  if (isMissingRecord(error)) {
    return { success: false as const, error: "Not found" }
  }
  return { success: false as const, error: `Failed to ${verb} ${record}` }
}

export async function saveSettingsAction(
  _prevState: ActionState<SettingsMap> | null,
  formData: FormData
): Promise<ActionState<SettingsMap>> {
  const denied = await accountsOnly()
  if (denied) return denied
  const user = await getCurrentUser()
  const validatedForm = settingsFormSchema.safeParse(Object.fromEntries(formData))

  if (!validatedForm.success) {
    return { success: false, error: validatedForm.error.message }
  }

  for (const key in validatedForm.data) {
    if (SELF_HOSTED_ONLY_SETTINGS_SET.has(key) && !config.selfHosted.isEnabled) {
      continue
    }
    const value = validatedForm.data[key as keyof typeof validatedForm.data]
    if (value !== undefined) {
      await updateSettings(user.id, key, value)
    }
  }

  revalidatePath("/settings/currencies")
  revalidatePath("/settings/categories")
  revalidatePath("/settings/llm")
  return { success: true }
}

export async function testLLMProviderAction(
  provider: string,
  apiKey: string,
  model: string,
  baseUrl?: string
): Promise<{ success: boolean; supportsVision: boolean; message: string }> {
  const denied = await accountsOnly()
  if (denied) return { success: false, supportsVision: false, message: denied.error }
  const config: LLMConfig = {
    provider: provider as LLMProvider,
    apiKey,
    model,
    baseUrl,
  }
  return testLLMProvider(config)
}

export async function saveProfileAction(
  _prevState: ActionState<User> | null,
  formData: FormData
): Promise<ActionState<User>> {
  const denied = await accountsOnly()
  if (denied) return denied
  const user = await getCurrentUser()
  const validatedForm = userFormSchema.safeParse(Object.fromEntries(formData))

  if (!validatedForm.success) {
    return { success: false, error: validatedForm.error.message }
  }

  // Upload avatar
  let avatarUrl = user.avatar
  const avatarFile = formData.get("avatar") as File | null
  if (avatarFile instanceof File && avatarFile.size > 0) {
    try {
      const uploadedAvatarPath = await uploadStaticImage(user, avatarFile, "avatar.webp", 500, 500)
      avatarUrl = `/files/static/${path.basename(uploadedAvatarPath)}`
    } catch (error) {
      return { success: false, error: "Failed to upload avatar: " + error }
    }
  }

  // Upload business logo
  let businessLogoUrl = user.businessLogo
  const businessLogoFile = formData.get("businessLogo") as File | null
  if (businessLogoFile instanceof File && businessLogoFile.size > 0) {
    try {
      const uploadedBusinessLogoPath = await uploadStaticImage(user, businessLogoFile, "businessLogo.png", 500, 500)
      businessLogoUrl = `/files/static/${path.basename(uploadedBusinessLogoPath)}`
    } catch (error) {
      return { success: false, error: "Failed to upload business logo: " + error }
    }
  }

  const email = validatedForm.data.email?.trim().toLowerCase()
  if (email && email !== user.email) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { success: false, error: "Enter a valid email address" }
    }
    const existing = await getUserByEmail(email)
    if (existing && existing.id !== user.id) {
      return { success: false, error: "That email is already in use" }
    }
  }

  // Update user
  await updateUser(user.id, {
    name: validatedForm.data.name !== undefined ? validatedForm.data.name : user.name,
    ...(email ? { email, ...(email !== user.email ? { emailVerified: true } : {}) } : {}),
    avatar: avatarUrl,
    businessName: validatedForm.data.businessName !== undefined ? validatedForm.data.businessName : user.businessName,
    businessAddress:
      validatedForm.data.businessAddress !== undefined ? validatedForm.data.businessAddress : user.businessAddress,
    businessBankDetails:
      validatedForm.data.businessBankDetails !== undefined
        ? validatedForm.data.businessBankDetails
        : user.businessBankDetails,
    businessLogo: businessLogoUrl,
  })

  revalidatePath("/settings/profile")
  return { success: true }
}

export async function addProjectAction(data: Prisma.ProjectCreateInput) {
  const denied = await accountsOnly()
  if (denied) return denied
  const user = await getCurrentUser()
  const validatedForm = projectFormSchema.safeParse(data)

  if (!validatedForm.success) {
    return { success: false, error: validatedForm.error.message }
  }

  const project = await createProject(user.id, {
    code: codeFromName(validatedForm.data.name),
    name: validatedForm.data.name,
    llm_prompt: validatedForm.data.llm_prompt || null,
    color: validatedForm.data.color || randomHexColor(),
  })
  revalidatePath("/settings/projects")

  return { success: true, project }
}

export async function editProjectAction(code: string, data: Prisma.ProjectUpdateInput) {
  const denied = await accountsOnly()
  if (denied) return denied
  const user = await getCurrentUser()
  const validatedForm = projectFormSchema.safeParse(data)

  if (!validatedForm.success) {
    return { success: false, error: validatedForm.error.message }
  }

  try {
    const project = await updateProject(user.id, code, {
      name: validatedForm.data.name,
      llm_prompt: validatedForm.data.llm_prompt,
      color: validatedForm.data.color || "",
    })
    revalidatePath("/settings/projects")
    return { success: true, project }
  } catch (error) {
    return ownedWriteError("update", "project", error)
  }
}

export async function deleteProjectAction(code: string) {
  const denied = await accountsOnly()
  if (denied) return denied
  const user = await getCurrentUser()
  try {
    await deleteProject(user.id, code)
  } catch (error) {
    return ownedWriteError("delete", "project", error)
  }
  revalidatePath("/settings/projects")
  return { success: true }
}

export async function addCurrencyAction(data: Prisma.CurrencyCreateInput) {
  const denied = await accountsOnly()
  if (denied) return denied
  const user = await getCurrentUser()
  const validatedForm = currencyFormSchema.safeParse(data)

  if (!validatedForm.success) {
    return { success: false, error: validatedForm.error.message }
  }

  const currency = await createCurrency(user.id, {
    code: validatedForm.data.code,
    name: validatedForm.data.name,
  })
  revalidatePath("/settings/currencies")

  return { success: true, currency }
}

export async function editCurrencyAction(code: string, data: Prisma.CurrencyUpdateInput) {
  const denied = await accountsOnly()
  if (denied) return denied
  const user = await getCurrentUser()
  const validatedForm = currencyFormSchema.safeParse(data)

  if (!validatedForm.success) {
    return { success: false, error: validatedForm.error.message }
  }

  try {
    const currency = await updateCurrency(user.id, code, { name: validatedForm.data.name })
    revalidatePath("/settings/currencies")
    return { success: true, currency }
  } catch (error) {
    return ownedWriteError("update", "currency", error)
  }
}

export async function deleteCurrencyAction(code: string) {
  const denied = await accountsOnly()
  if (denied) return denied
  const user = await getCurrentUser()
  try {
    await deleteCurrency(user.id, code)
  } catch (error) {
    return ownedWriteError("delete", "currency", error)
  }
  revalidatePath("/settings/currencies")
  return { success: true }
}

export async function addCategoryAction(data: Prisma.CategoryCreateInput) {
  const denied = await accountsOnly()
  if (denied) return denied
  const user = await getCurrentUser()
  const validatedForm = categoryFormSchema.safeParse(data)

  if (!validatedForm.success) {
    return { success: false, error: validatedForm.error.message }
  }

  const code = codeFromName(validatedForm.data.name)
  try {
    const category = await createCategory(user.id, {
      code,
      name: validatedForm.data.name,
      llm_prompt: validatedForm.data.llm_prompt,
      color: validatedForm.data.color || randomHexColor(),
    })
    revalidatePath("/settings/categories")

    return { success: true, category }
  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return {
        success: false,
        error: `Category with the code "${code}" already exists. Try a different name.`,
      }
    }
    return { success: false, error: "Failed to create category" }
  }
}

export async function editCategoryAction(code: string, data: Prisma.CategoryUpdateInput) {
  const denied = await accountsOnly()
  if (denied) return denied
  const user = await getCurrentUser()
  const validatedForm = categoryFormSchema.safeParse(data)

  if (!validatedForm.success) {
    return { success: false, error: validatedForm.error.message }
  }

  try {
    const category = await updateCategory(user.id, code, {
      name: validatedForm.data.name,
      llm_prompt: validatedForm.data.llm_prompt,
      color: validatedForm.data.color || "",
    })
    revalidatePath("/settings/categories")
    return { success: true, category }
  } catch (error) {
    return ownedWriteError("update", "category", error)
  }
}

export async function deleteCategoryAction(code: string) {
  const denied = await accountsOnly()
  if (denied) return denied
  const user = await getCurrentUser()
  try {
    await deleteCategory(user.id, code)
  } catch (error) {
    return ownedWriteError("delete", "category", error)
  }
  revalidatePath("/settings/categories")
  return { success: true }
}

export async function addFieldAction(data: Prisma.FieldCreateInput) {
  const denied = await accountsOnly()
  if (denied) return denied
  const user = await getCurrentUser()
  const validatedForm = fieldFormSchema.safeParse(data)

  if (!validatedForm.success) {
    return { success: false, error: validatedForm.error.message }
  }

  const field = await createField(user.id, {
    code: codeFromName(validatedForm.data.name),
    name: validatedForm.data.name,
    type: validatedForm.data.type,
    llm_prompt: validatedForm.data.llm_prompt,
    isVisibleInList: validatedForm.data.isVisibleInList,
    isVisibleInAnalysis: validatedForm.data.isVisibleInAnalysis,
    isRequired: validatedForm.data.isRequired,
    isExtra: true,
  })
  revalidatePath("/settings/fields")

  return { success: true, field }
}

export async function editFieldAction(code: string, data: Prisma.FieldUpdateInput) {
  const denied = await accountsOnly()
  if (denied) return denied
  const user = await getCurrentUser()
  const validatedForm = fieldFormSchema.safeParse(data)

  if (!validatedForm.success) {
    return { success: false, error: validatedForm.error.message }
  }

  try {
    const field = await updateField(user.id, code, {
      name: validatedForm.data.name,
      type: validatedForm.data.type,
      llm_prompt: validatedForm.data.llm_prompt,
      isVisibleInList: validatedForm.data.isVisibleInList,
      isVisibleInAnalysis: validatedForm.data.isVisibleInAnalysis,
      isRequired: validatedForm.data.isRequired,
    })
    revalidatePath("/settings/fields")
    return { success: true, field }
  } catch (error) {
    return ownedWriteError("update", "field", error)
  }
}

export async function deleteFieldAction(code: string) {
  const denied = await accountsOnly()
  if (denied) return denied
  const user = await getCurrentUser()
  try {
    await deleteField(user.id, code)
  } catch (error) {
    return ownedWriteError("delete", "field", error)
  }
  revalidatePath("/settings/fields")
  return { success: true }
}
