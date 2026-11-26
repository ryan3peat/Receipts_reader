import { getActor } from "@/lib/access"
import {
  fieldAvailableFor,
  nrCodeForField,
  normalizeSplits,
  parseSplits,
  type DepartmentSplit,
} from "@/lib/gl-resolve"
import { listDepartments, listGlFieldRows, personDepartments } from "@/models/gl-departments"

export type GlPatch = {
  categoryCode?: string | null
  glFieldKey?: string | null
  departmentSplits?: DepartmentSplit[] | null
}

type GlResult = { ok: true; patch: GlPatch } | { ok: false; error: string }

/**
 * Works out the GL columns for a saved receipt from the submitted form.
 * Cardholders send a GL field key and optional department splits. Accounts send an NR code directly.
 * Everything is checked here, so the form cannot post a code the cardholder is not allowed to use.
 */
export async function glPatchFromForm(form: FormData, mode: "create" | "update"): Promise<GlResult> {
  const actor = await getActor()
  const submitted = String(form.get("categoryCode") ?? "").trim()
  const splitsRaw = String(form.get("departmentSplits") ?? "").trim()

  if (actor.effectiveRole === "accounts") {
    // Accounts choose the NR code themselves. A new receipt starts with no department split, which
    // falls back to the cardholder's default department at export. Editing leaves the split alone.
    const patch: GlPatch = { categoryCode: submitted || null }
    if (mode === "create") patch.departmentSplits = null
    return { ok: true, patch }
  }

  const companyId = actor.companyUser.id
  const [mine, allDepartments, fields] = await Promise.all([
    personDepartments(companyId, actor.user.id),
    listDepartments(companyId),
    listGlFieldRows(companyId),
  ])
  if (mine.length === 0) {
    return { ok: false, error: "You are not assigned to a department yet. Ask Accounts to add you." }
  }

  const field = fields.find((item) => item.key === submitted)
  if (!field) return { ok: false, error: "Choose a category from the list" }

  const allowedDepartments = new Set(allDepartments.map((department) => department.code))
  let splits: DepartmentSplit[]
  if (splitsRaw) {
    let parsed: unknown
    try {
      parsed = JSON.parse(splitsRaw)
    } catch {
      return { ok: false, error: "The department split could not be read. Try again." }
    }
    const checked = normalizeSplits(parseSplits(parsed) ?? [], allowedDepartments)
    if (!checked.ok) return checked
    splits = checked.splits
  } else {
    const home = mine.find((department) => department.isDefault) ?? mine[0]
    splits = [{ code: home.code, percent: 100 }]
  }

  const codes = splits.map((split) => split.code)
  if (!fieldAvailableFor(field, codes)) {
    return { ok: false, error: `${field.name} is not available for every selected department. Choose another category.` }
  }

  return {
    ok: true,
    patch: { categoryCode: nrCodeForField(field), glFieldKey: field.key, departmentSplits: splits },
  }
}
