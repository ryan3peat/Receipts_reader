import { COMPUTED_FIELD_CODES } from "@/models/defaults-data"
import { Field } from "@/prisma/client"

const NON_FORM_FIELD_CODES = new Set(["files", ...COMPUTED_FIELD_CODES])

function isEmptyValue(value: unknown): boolean {
  if (value === undefined || value === null) return true
  if (typeof value === "string") {
    const trimmed = value.trim()
    return trimmed === "" || trimmed === "-"
  }
  return false
}

/** Fields that should render on transaction / unsorted forms. */
export function isFieldShownInForm(field: Field | undefined): boolean {
  if (!field) return false
  return field.isVisibleInAnalysis || field.isRequired
}

/** Required fields that appear on transaction / unsorted forms and are still empty. */
export function missingRequiredFormFields(
  fields: Field[],
  data: Record<string, unknown>
): Field[] {
  return fields.filter((field) => {
    if (!field.isRequired) return false
    if (NON_FORM_FIELD_CODES.has(field.code)) return false
    return isEmptyValue(data[field.code])
  })
}

export function missingRequiredFormFieldNames(
  fields: Field[],
  data: Record<string, unknown>
): string[] {
  return missingRequiredFormFields(fields, data).map((field) => field.name)
}
