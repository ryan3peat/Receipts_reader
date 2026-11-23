import { describe, expect, it } from "vitest"
import {
  classifyLine,
  gstLines,
  matchStatementLines,
  missingPurchases,
  parseStatementOutput,
  resolveVatCents,
  sapRowsForStatement,
  type SapReceipt,
} from "./sap"

describe("gstLines", () => {
  it("marks a standard 10 percent receipt as P1 on the ex-GST amount", () => {
    expect(gstLines(11000, 1000)).toEqual([{ gstCode: "P1", amountCents: 10000 }])
  })

  it("marks a GST-free receipt as P2", () => {
    expect(gstLines(22800, 0)).toEqual([{ gstCode: "P2", amountCents: 22800 }])
  })

  it("splits a mixed receipt into a taxable line and a GST-free line", () => {
    // $159.45 charge, $13.00 GST. Taxable ex-GST is $130.00, GST-free remainder is $16.45.
    expect(gstLines(15945, 1300)).toEqual([
      { gstCode: "P1", amountCents: 13000 },
      { gstCode: "P2", amountCents: 1645, note: "Split because the receipt includes a GST-free component" },
    ])
  })
})

describe("resolveVatCents", () => {
  it("reads the GST amount typed on the receipt", () => {
    expect(resolveVatCents(11000, { vat: "10.00" })).toBe(1000)
  })

  it("derives GST when the rate is 10 and no amount was entered", () => {
    expect(resolveVatCents(11000, { vat_rate: "10" })).toBe(1000)
  })
})

describe("parseStatementOutput", () => {
  it("keeps purchases and classifies fees and payments from the narrative", () => {
    const parsed = parseStatementOutput({
      accountName: "Anne Madder",
      accountNumber: "4336-8771-0279-0829",
      period: "29/08/2026 - 29/09/2026",
      lines: [
        { date: "2026-09-10", narrative: "Go 2 CAFE Carrum Downs CREDIT CARD PURCHASE", amount: 660.73, kind: "purchase" },
        { date: "2026-09-29", narrative: "CARD FEE FEES", amount: 12, kind: "purchase" },
        { date: "2026-09-22", narrative: "INTERNET PAYMENT Anne CC Top Up", amount: 3000, kind: "payment" },
      ],
    })

    expect(parsed.accountName).toBe("Anne Madder")
    expect(parsed.lines.map((line) => line.kind)).toEqual(["purchase", "fee", "payment"])
    expect(parsed.lines[0].amountCents).toBe(66073)
  })
})

describe("matchStatementLines", () => {
  const receipt: SapReceipt = {
    id: "r1",
    issuedOn: "2026-09-10",
    totalCents: 66073,
    vatCents: 6007,
    merchant: "Go 2 Cafe",
    name: "Flavour Academy catering",
    description: null,
    categoryCode: "2225",
    projectCode: null,
  }

  it("matches a purchase to the receipt and leaves an unmatched purchase missing", () => {
    const lines = [
      {
        id: "s1",
        postedOn: "2026-09-10",
        narrative: "Go 2 CAFE Carrum Downs CREDIT CARD PURCHASE",
        amountCents: 66073,
        kind: "purchase" as const,
      },
      {
        id: "s2",
        postedOn: "2026-09-24",
        narrative: "KMART 1222 CARRUM DOWNS CREDIT CARD PURCHASE",
        amountCents: 1000,
        kind: "purchase" as const,
      },
    ]
    const matches = matchStatementLines(lines, [receipt])
    expect(matches[0].receipt?.id).toBe("r1")
    expect(missingPurchases(matches).map((match) => match.line.id)).toEqual(["s2"])
  })

  it("highlights the unmatched purchase on the FOR SAP rows", () => {
    const rows = sapRowsForStatement(
      [
        {
          id: "s2",
          postedOn: "2026-09-24",
          narrative: "KMART 1222 CARRUM DOWNS CREDIT CARD PURCHASE",
          amountCents: 1000,
          kind: "purchase",
        },
      ],
      [],
      { categories: new Map(), projects: new Map(), dimension: "ANNMAD" }
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].missing).toBe(true)
    expect(rows[0].description).toBe("MISSING RECEIPT")
    expect(rows[0].dimension).toBe("ANNMAD")
  })
})

describe("classifyLine", () => {
  it("treats a card fee as a fee even if the model called it a purchase", () => {
    expect(classifyLine("CARD FEE FEES", "purchase")).toBe("fee")
  })
})
