"use server"

import { requireAccounts } from "@/lib/access"
import { getCurrentUser } from "@/lib/auth"
import {
  autoFillFromEfi,
  combineFields,
  createEfiCode,
  createNrCode,
  linkEfiCode,
  renameField,
  seedFromSheet,
  setCombinedPostCode,
  setFieldDepartments,
  splitCombinedField,
} from "@/models/gl-departments"
import { revalidatePath } from "next/cache"

export type GlActionResult = { success: true } | { success: false; error: string }

const NAME_MAX = 100
const NR_CODE = /^\d{4}$/
const EFI_CODE = /^\d{4}-\d{2}$/

function cleanName(value: string) {
  return value.trim().slice(0, NAME_MAX)
}

function cleanIds(values: string[]) {
  return [...new Set(values.filter((value) => typeof value === "string" && value.length > 0))]
}

function failure(error: unknown): GlActionResult {
  return { success: false, error: error instanceof Error ? error.message : "Something went wrong. Try again." }
}

// Every action here is Accounts only and works on the company's own records.
async function run(work: (companyId: string) => Promise<unknown>): Promise<GlActionResult> {
  const gate = await requireAccounts()
  if (!gate.ok) return { success: false, error: gate.error }
  const company = await getCurrentUser()
  try {
    await work(company.id)
  } catch (error) {
    return failure(error)
  }
  revalidatePath("/settings/categories")
  revalidatePath("/settings/users")
  revalidatePath("/transactions")
  revalidatePath("/sap")
  return { success: true }
}

export async function setFieldDepartmentsAction(fieldIds: string[], addIds: string[], removeIds: string[]) {
  return run((companyId) =>
    setFieldDepartments(companyId, cleanIds(fieldIds), cleanIds(addIds), cleanIds(removeIds))
  )
}

export async function renameFieldAction(fieldId: string, name: string, postCode: string | null) {
  const clean = cleanName(name)
  if (!clean) return { success: false as const, error: "Enter a name" }
  return run(async (companyId) => {
    await renameField(companyId, fieldId, clean)
    await setCombinedPostCode(companyId, fieldId, postCode || null).catch((error: unknown) => {
      // Single fields have no post code. Renaming them alone is fine.
      if (error instanceof Error && error.message === "Only combined fields have a post code") return
      throw error
    })
  })
}

export async function combineFieldsAction(fieldIds: string[], name: string, postCode: string | null) {
  const clean = cleanName(name)
  if (!clean) return { success: false as const, error: "Enter a name for the combined field" }
  return run((companyId) => combineFields(companyId, cleanIds(fieldIds), clean, postCode || null))
}

export async function splitFieldAction(fieldId: string) {
  return run((companyId) => splitCombinedField(companyId, fieldId))
}

export async function createNrCodeAction(code: string, name: string) {
  const cleanCode = code.trim()
  const clean = cleanName(name)
  if (!NR_CODE.test(cleanCode)) return { success: false as const, error: "The code must be 4 digits" }
  if (!clean) return { success: false as const, error: "Enter a name" }
  return run((companyId) => createNrCode(companyId, cleanCode, clean))
}

export async function autoFillFromEfiAction() {
  return run((companyId) => autoFillFromEfi(companyId))
}

export async function linkEfiCodeAction(efiId: string, nrCode: string | null) {
  return run((companyId) => linkEfiCode(companyId, efiId, nrCode || null))
}

export async function createEfiCodeAction(input: {
  code: string
  name: string
  departmentId: string
  nrCode: string | null
}) {
  const code = input.code.trim()
  const name = cleanName(input.name)
  if (!EFI_CODE.test(code)) return { success: false as const, error: "The EFI code looks like 2210-03" }
  if (!name) return { success: false as const, error: "Enter an account name" }
  return run((companyId) =>
    createEfiCode(companyId, { code, name, departmentId: input.departmentId, nrCode: input.nrCode || null })
  )
}

export async function seedFromSheetAction(): Promise<
  { success: true; summary: Awaited<ReturnType<typeof seedFromSheet>> } | { success: false; error: string }
> {
  const gate = await requireAccounts()
  if (!gate.ok) return { success: false, error: gate.error }
  const company = await getCurrentUser()
  try {
    const summary = await seedFromSheet(company.id)
    revalidatePath("/settings/categories")
    revalidatePath("/settings/users")
    return { success: true, summary }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Something went wrong. Try again." }
  }
}
