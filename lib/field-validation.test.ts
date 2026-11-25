import { describe, expect, it } from "vitest"
import {
  isFieldShownInForm,
  missingRequiredFormFieldNames,
  missingRequiredFormFields,
} from "./field-validation"

const fields = [
  { code: "name", name: "Name", isRequired: true, isVisibleInAnalysis: true },
  { code: "note", name: "Reason", isRequired: true, isVisibleInAnalysis: false },
  { code: "type", name: "Type", isRequired: false, isVisibleInAnalysis: false },
  { code: "projectCode", name: "Project", isRequired: false, isVisibleInAnalysis: true },
  { code: "files", name: "Files", isRequired: true, isVisibleInAnalysis: true },
] as any

describe("isFieldShownInForm", () => {
  it("shows fields marked visible or required", () => {
    expect(isFieldShownInForm(fields[0])).toBe(true)
    expect(isFieldShownInForm(fields[1])).toBe(true)
    expect(isFieldShownInForm(fields[2])).toBe(false)
    expect(isFieldShownInForm(fields[3])).toBe(true)
  })
})

describe("missingRequiredFormFields", () => {
  it("flags required fields that are empty", () => {
    const missing = missingRequiredFormFields(fields, { name: "Coffee", note: "  " })
    expect(missing.map((field) => field.code)).toEqual(["note"])
  })

  it("treats select sentinel '-' as empty", () => {
    const names = missingRequiredFormFieldNames(
      [{ code: "categoryCode", name: "GL Code", isRequired: true, isVisibleInAnalysis: true } as any],
      { categoryCode: "-" }
    )
    expect(names).toEqual(["GL Code"])
  })

  it("ignores non-form fields like files", () => {
    const names = missingRequiredFormFieldNames(fields, { name: "Coffee", note: "Team lunch" })
    expect(names).not.toContain("Files")
  })
})
