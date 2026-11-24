import { describe, expect, it } from "vitest"
import {
  buildTree,
  DEFAULT_THRESHOLDS,
  groupStatements,
  levelFor,
  monthOf,
  neededForGreen,
  parseThresholds,
  pickDefault,
  rollup,
  splitForQueue,
  validateThresholds,
  windowStart,
  type StatementSummary,
} from "./reconciliation"

const T = DEFAULT_THRESHOLDS

function statement(partial: Partial<StatementSummary> & { id: string; employeeId: string; month: string | null }): StatementSummary {
  return { employeeName: partial.employeeId, accountNumber: "", purchases: 10, missing: 0, ...partial }
}

describe("levelFor", () => {
  it("is red under 50 percent attached", () => {
    expect(levelFor(10, 6, T)).toBe("red") // 40%
    expect(levelFor(16, 9, T)).toBe("red") // 44%
  })

  it("is orange from 50 to 90 percent attached, both ends included", () => {
    expect(levelFor(10, 5, T)).toBe("orange") // 50%
    expect(levelFor(10, 1, T)).toBe("orange") // 90%
  })

  it("is green over 90 percent attached", () => {
    expect(levelFor(11, 1, T)).toBe("green") // 91%
    expect(levelFor(10, 0, T)).toBe("green")
  })

  it("treats a statement with no purchases as green", () => {
    expect(levelFor(0, 0, T)).toBe("green")
  })

  it("follows changed thresholds", () => {
    expect(levelFor(10, 4, { redBelow: 70, greenAbove: 95 })).toBe("red") // 60%
    expect(levelFor(10, 2, { redBelow: 30, greenAbove: 75 })).toBe("green") // 80%
  })

  it("is green at a 100 threshold only when nothing is missing", () => {
    const strict = { redBelow: 50, greenAbove: 100 }
    expect(levelFor(20, 1, strict)).toBe("orange")
    expect(levelFor(20, 0, strict)).toBe("green")
  })
})

describe("neededForGreen", () => {
  it("is zero when already green", () => {
    expect(neededForGreen(11, 1, T)).toBe(0)
  })

  it("counts the receipts still needed to get over the green line", () => {
    expect(neededForGreen(10, 5, T)).toBe(5) // needs 10 of 10, since 9 of 10 is exactly 90%
    expect(neededForGreen(16, 9, T)).toBe(8) // needs 15 of 16, has 7
    expect(neededForGreen(20, 4, T)).toBe(3) // needs 19 of 20, has 16
  })

  it("needs every receipt at a 100 threshold", () => {
    expect(neededForGreen(20, 3, { redBelow: 50, greenAbove: 100 })).toBe(3)
  })
})

describe("validateThresholds and parseThresholds", () => {
  it("accepts whole numbers where red is not above green", () => {
    expect(validateThresholds(50, 90)).toBeNull()
    expect(validateThresholds(90, 90)).toBeNull()
  })

  it("rejects out of range, fractional, and crossed values", () => {
    expect(validateThresholds(-1, 90)).not.toBeNull()
    expect(validateThresholds(50, 101)).not.toBeNull()
    expect(validateThresholds(50.5, 90)).not.toBeNull()
    expect(validateThresholds(95, 90)).not.toBeNull()
  })

  it("reads saved settings and falls back to the defaults when they are missing or broken", () => {
    expect(parseThresholds({ recon_red_below: "40", recon_green_above: "85" })).toEqual({ redBelow: 40, greenAbove: 85 })
    expect(parseThresholds({})).toEqual(DEFAULT_THRESHOLDS)
    expect(parseThresholds({ recon_red_below: "abc", recon_green_above: "85" })).toEqual(DEFAULT_THRESHOLDS)
    expect(parseThresholds({ recon_red_below: "95", recon_green_above: "85" })).toEqual(DEFAULT_THRESHOLDS)
  })
})

describe("months", () => {
  it("reads the month from a UTC date", () => {
    expect(monthOf(new Date("2026-10-31T00:00:00.000Z"))).toBe("2026-10")
    expect(monthOf(null)).toBeNull()
  })

  it("starts the recent window five months before the latest, crossing a year", () => {
    expect(windowStart("2026-10")).toBe("2026-05")
    expect(windowStart("2026-03")).toBe("2025-10")
    expect(windowStart("2026-12", 12)).toBe("2026-01")
  })
})

describe("groupStatements", () => {
  it("merges two cards for the same person and month", () => {
    const groups = groupStatements([
      statement({ id: "a", employeeId: "tim", month: "2026-10", accountNumber: "1111", purchases: 8, missing: 2 }),
      statement({ id: "b", employeeId: "tim", month: "2026-10", accountNumber: "2222", purchases: 4, missing: 1 }),
      statement({ id: "c", employeeId: "tim", month: "2026-09" }),
    ])
    expect(groups).toHaveLength(2)
    const october = groups.find((group) => group.month === "2026-10")
    expect(october).toMatchObject({ statementIds: ["a", "b"], cards: ["1111", "2222"], purchases: 12, missing: 3 })
  })
})

describe("rollup and splitForQueue", () => {
  const groups = groupStatements([
    statement({ id: "1", employeeId: "amy", month: "2026-10", purchases: 10, missing: 0 }),
    statement({ id: "2", employeeId: "ben", month: "2026-10", purchases: 10, missing: 6 }),
    statement({ id: "3", employeeId: "cat", month: "2026-10", purchases: 10, missing: 2 }),
  ])

  it("counts people per colour and totals the receipts", () => {
    expect(rollup(groups, T)).toMatchObject({ count: 3, purchases: 30, missing: 8, red: 1, orange: 1, green: 1 })
  })

  it("puts the worst first and keeps complete statements apart", () => {
    const { incomplete, complete } = splitForQueue(groups, T)
    expect(incomplete.map((group) => group.employeeId)).toEqual(["ben", "cat"])
    expect(complete.map((group) => group.employeeId)).toEqual(["amy"])
  })
})

describe("buildTree and pickDefault", () => {
  const groups = groupStatements([
    statement({ id: "1", employeeId: "amy", month: "2026-10", missing: 0 }),
    statement({ id: "2", employeeId: "ben", month: "2026-10", missing: 0 }),
    statement({ id: "3", employeeId: "amy", month: "2026-09", missing: 7 }),
    statement({ id: "4", employeeId: "amy", month: "2025-12", missing: 1 }),
    statement({ id: "5", employeeId: "ben", month: null, missing: 3 }),
  ])

  it("nests months under years, newest first, with undated statements last", () => {
    const tree = buildTree(groups)
    expect(tree.map((node) => node.year)).toEqual(["2026", "2025", "Undated"])
    expect(tree[0].months.map((node) => node.month)).toEqual(["2026-10", "2026-09"])
  })

  it("opens the worst incomplete statement in the newest month that has one", () => {
    expect(pickDefault(groups, T)?.key).toBe("amy|2026-09")
  })

  it("opens the newest statement when everything is complete", () => {
    const clean = groupStatements([
      statement({ id: "1", employeeId: "amy", month: "2026-10" }),
      statement({ id: "2", employeeId: "amy", month: "2026-09" }),
    ])
    expect(pickDefault(clean, T)?.month).toBe("2026-10")
  })

  it("returns null with no statements", () => {
    expect(pickDefault([], T)).toBeNull()
  })
})
