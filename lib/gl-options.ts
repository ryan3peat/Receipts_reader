import type { Actor } from "@/lib/access"
import { getCategories } from "@/models/categories"
import { listDepartments, listGlFieldRows, personDepartments, personGlFields } from "@/models/gl-departments"

export type GlOption = { code: string; name: string; color: string }

/** What the cardholder form needs: every department for splits, and the fields they can charge. */
export type GlPicker = {
  departments: { code: string; name: string; isDefault: boolean }[]
  fields: { key: string; name: string; combined: boolean; members: string[]; departments: string[] }[]
}

/**
 * Accounts pick any NR category, as before. Cardholders pick a category name from their departments,
 * and can add other departments when splitting a receipt.
 */
export async function glFormChoices(actor: Actor): Promise<{ options: GlOption[]; picker: GlPicker | null }> {
  const companyId = actor.companyUser.id
  if (actor.effectiveRole === "accounts") {
    const categories = await getCategories(companyId)
    return {
      options: categories.map((category) => ({ code: category.code, name: category.name, color: category.color })),
      picker: null,
    }
  }

  const [mine, allDepartments, mineFields, allFields] = await Promise.all([
    personDepartments(companyId, actor.user.id),
    listDepartments(companyId),
    personGlFields(companyId, actor.user.id),
    listGlFieldRows(companyId),
  ])
  const homeCode = mine.find((department) => department.isDefault)?.code ?? mine[0]?.code ?? null

  return {
    options: mineFields.map((field) => ({ code: field.key, name: field.name, color: "#64748b" })),
    picker: {
      // All departments so "Add others" can split a charge. isDefault marks the cardholder's home.
      departments: allDepartments.map((department) => ({
        code: department.code,
        name: department.name,
        isDefault: department.code === homeCode,
      })),
      // All fields so a multi-department split can show the shared categories.
      fields: allFields.map((field) => ({
        key: field.key,
        name: field.name,
        combined: field.combined,
        members: field.members,
        departments: field.departments,
      })),
    },
  }
}
