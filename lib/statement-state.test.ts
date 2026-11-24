import { describe, expect, it } from "vitest"
import type { CombinedStatement, ParsedCardSection } from "@/lib/sap"
import {
  estimateRemaining,
  formatElapsed,
  formatRemaining,
  hasCardLines,
  pagesLeft,
  planSave,
  readEntries,
  readState,
} from "@/lib/statement-state"

function section(overrides: Partial<ParsedCardSection>): ParsedCardSection {
  return {
    accountName: "MR TIM NIELSEN",
    accountNumber: "4111111111111111",
    periodLabel: "01 Jan 2026 to 31 Jan 2026",
    billing: false,
    pages: [1],
    statedTotalCents: null,
    lines: [{ postedOn: "2026-01-05", narrative: "COFFEE", amountCents: 450, kind: "purchase" }],
    ...overrides,
  }
}

describe("readState", () => {
  it("accepts a stored state and fills in what is missing", () => {
    expect(readState({ pageCount: 3 })).toEqual({ pageCount: 3, blank: [], read: {} })
    expect(readState({ pageCount: 3, blank: [2], read: { "1": [{ a: 1 }] } })).toEqual({
      pageCount: 3,
      blank: [2],
      read: { "1": [{ a: 1 }] },
    })
  })

  it("rejects anything that is not a statement in progress", () => {
    expect(readState(null)).toBeNull()
    expect(readState({})).toBeNull()
    expect(readState({ pageCount: 0 })).toBeNull()
    expect(readState({ pageCount: 1.5 })).toBeNull()
    // The shape used before pages were skipped one by one is not resumed.
    expect(readState({ printedPages: [1, 2], read: {} })).toBeNull()
  })
})

describe("pagesLeft and readEntries", () => {
  const state = { pageCount: 4, blank: [2], read: { "1": [{ n: "a" }], "4": [{ n: "d" }] } as Record<string, unknown[]> }

  it("lists pages that are neither blank nor read", () => {
    expect(pagesLeft(state)).toEqual([3])
    expect(pagesLeft({ ...state, read: { ...state.read, "3": [] } })).toEqual([])
  })

  it("returns entries in page order", () => {
    expect(readEntries({ ...state, read: { "4": [{ n: "d" }], "1": [{ n: "a" }] } })).toEqual([{ n: "a" }, { n: "d" }])
  })
})

describe("planSave", () => {
  const people = [{ id: "u1", name: "Tim Nielsen", cardNumber: "4111111111111111" }]

  it("targets matched cards, reports unmatched ones and skips billing and empty sections", () => {
    const combined: CombinedStatement = {
      sections: [
        section({ billing: true, accountName: "BILLING ACCOUNT", accountNumber: "" }),
        section({}),
        section({ accountName: "MS NOBODY KNOWN", accountNumber: "4999999999999999" }),
        section({ accountName: "MR EMPTY HOLDER", accountNumber: "4888888888888888", lines: [] }),
      ],
      summary: [],
    }
    const plan = planSave(combined, people)
    expect(plan.targets.map((target) => [target.index, target.person.id])).toEqual([[1, "u1"]])
    expect(plan.unmatched).toEqual([{ accountName: "MS NOBODY KNOWN", accountNumber: "4999999999999999", lineCount: 1 }])
    expect(plan.checks.length).toBeGreaterThan(0)
  })

  it("detects a statement with no card lines", () => {
    expect(hasCardLines({ sections: [section({ billing: true })], summary: [] })).toBe(false)
    expect(hasCardLines({ sections: [section({ lines: [] })], summary: [] })).toBe(false)
    expect(hasCardLines({ sections: [section({})], summary: [] })).toBe(true)
  })
})

describe("timing text", () => {
  it("formats elapsed time", () => {
    expect(formatElapsed(0)).toBe("0s")
    expect(formatElapsed(8_400)).toBe("8s")
    expect(formatElapsed(65_000)).toBe("1m 05s")
    expect(formatElapsed(-5)).toBe("0s")
  })

  it("estimates time left only once there is something to go on", () => {
    expect(estimateRemaining([10_000], 5)).toBeNull()
    expect(estimateRemaining([10_000, 20_000], 0)).toBeNull()
    expect(estimateRemaining([10_000, 20_000], 4)).toBe(60_000)
  })

  it("rounds the time left", () => {
    expect(formatRemaining(1_000)).toBe("about 5s")
    expect(formatRemaining(42_000)).toBe("about 40s")
    expect(formatRemaining(150_000)).toBe("about 3 min")
  })
})
