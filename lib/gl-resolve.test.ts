import { describe, expect, it } from "vitest"
import {
  departmentShares,
  equalSplits,
  fieldAvailableFor,
  type GlFieldRule,
  nrCodeForField,
  normalizeSplits,
  parseSplits,
} from "./gl-resolve"

const meals: GlFieldRule = {
  key: "combo-meals",
  name: "Meals & Entertainment",
  combined: true,
  postCode: null,
  members: ["2210", "2211"],
  departments: ["03", "04"],
}

describe("parseSplits", () => {
  it("keeps valid rows and drops junk", () => {
    expect(parseSplits([{ code: "03", percent: 60 }, { code: "", percent: 10 }, null, { code: "04", percent: 40 }])).toEqual([
      { code: "03", percent: 60 },
      { code: "04", percent: 40 },
    ])
  })

  it("returns null for non-arrays", () => {
    expect(parseSplits("nope")).toBeNull()
    expect(parseSplits(null)).toBeNull()
  })
})

describe("normalizeSplits", () => {
  const allowed = new Set(["03", "04"])

  it("accepts percentages that add up to 100", () => {
    expect(normalizeSplits([{ code: "03", percent: 50 }, { code: "04", percent: 50 }], allowed)).toEqual({
      ok: true,
      splits: [{ code: "03", percent: 50 }, { code: "04", percent: 50 }],
    })
  })

  it("rejects a department the user does not belong to", () => {
    const result = normalizeSplits([{ code: "06", percent: 100 }], allowed)
    expect(result.ok).toBe(false)
  })

  it("rejects totals other than 100", () => {
    expect(normalizeSplits([{ code: "03", percent: 40 }, { code: "04", percent: 40 }], allowed)).toEqual({
      ok: false,
      error: "Department split adds up to 80%, it must be 100%",
    })
  })
})

describe("equalSplits", () => {
  it("gives the rounding remainder to the first department", () => {
    expect(equalSplits(["01", "02", "03"])).toEqual([
      { code: "01", percent: 34 },
      { code: "02", percent: 33 },
      { code: "03", percent: 33 },
    ])
  })
})

describe("fieldAvailableFor", () => {
  it("needs the field to be visible in every ticked department", () => {
    expect(fieldAvailableFor(meals, ["03"])).toBe(true)
    expect(fieldAvailableFor(meals, ["03", "04"])).toBe(true)
    expect(fieldAvailableFor(meals, ["03", "06"])).toBe(false)
    expect(fieldAvailableFor(meals, [])).toBe(false)
  })
})

describe("nrCodeForField", () => {
  it("uses the single NR code for a plain field", () => {
    expect(nrCodeForField({ ...meals, key: "2410", combined: false, members: ["2410"], postCode: null })).toBe("2410")
  })

  it("leaves a review combined field without a code so Accounts choose", () => {
    expect(nrCodeForField(meals)).toBeNull()
  })

  it("uses the fixed post code of a combined field", () => {
    expect(nrCodeForField({ ...meals, postCode: "2211" })).toBe("2211")
  })
})

describe("departmentShares", () => {
  it("returns the whole receipt for one department", () => {
    expect(departmentShares(11000, 1000, [{ code: "03", percent: 100 }])).toEqual([
      { code: "03", totalCents: 11000, vatCents: 1000 },
    ])
  })

  it("splits total and GST so the shares add back to the receipt", () => {
    const shares = departmentShares(10001, 909, [
      { code: "03", percent: 33 },
      { code: "04", percent: 67 },
    ])
    expect(shares.reduce((sum, share) => sum + (share.totalCents ?? 0), 0)).toBe(10001)
    expect(shares.reduce((sum, share) => sum + share.vatCents, 0)).toBe(909)
    expect(shares[0]).toEqual({ code: "03", totalCents: 3300, vatCents: 300 })
  })
})
