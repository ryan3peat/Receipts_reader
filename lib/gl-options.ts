import type { Actor } from "@/lib/access"
import { getCategories } from "@/models/categories"
import { personDepartments, personGlFields } from "@/models/gl-departments"

export type GlOption = { code: string; name: string; color: string }

/** What the cardholder form needs to show the department checkboxes and the filtered GL list. */
export type GlPicker = {
  departments: { code: string; name: string; isDefault: boolean }[]
  fields: { key: string; name: string; combined: boolean; members: string[]; departments: string[] }[]
}

/**
 * Accounts pick any NR category, as before. Cardholders pick a GL field from their departments,
 * and the form uses the picker to choose departments and split them.
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

  const [departments, fields] = await Promise.all([
    personDepartments(companyId, actor.user.id),
    personGlFields(companyId, actor.user.id),
  ])
  return {
    options: fields.map((field) => ({ code: field.key, name: field.name, color: "#64748b" })),
    picker: {
      departments: departments.map((department) => ({
        code: department.code,
        name: department.name,
        isDefault: department.isDefault,
      })),
      fields: fields.map((field) => ({
        key: field.key,
        name: field.name,
        combined: field.combined,
        members: field.members,
        departments: field.departments,
      })),
    },
  }
}
