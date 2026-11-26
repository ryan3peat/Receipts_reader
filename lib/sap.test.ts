import { describe, expect, it } from "vitest"
import {
  classifyLine,
  entertainmentFbtSplits,
  gstLines,
  matchStatementLines,
  missingPurchases,
  parseStatementOutput,
  netAmountAfterGstCents,
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

describe("entertainmentFbtSplits", () => {
  it("splits the Coffee Club sample 50-50 across 2210 and 2211 with half GST", () => {
    // $52.89 total, $4.77 GST, $0.39 GST-free service charge.
    // SAP Amount is after GST: 2210 $26.45 P2; 2211 $23.80 P1 + $0.26 P2.
    expect(entertainmentFbtSplits(5289, 477)).toEqual([
      {
        glCode: "2210",
        gstCode: "P2",
        amountCents: 2645,
        note: "FBT 50-50: non-deductible half (no GST claim)",
      },
      {
        glCode: "2211",
        gstCode: "P1",
        amountCents: 2380,
        note: "FBT 50-50: deductible half (GST claimable)",
      },
      {
        glCode: "2211",
        gstCode: "P2",
        amountCents: 26,
        note: "FBT 50-50: deductible half (GST-free component)",
      },
    ])
  })

  it("puts a fully taxable entertainment receipt half on 2210 P2 and half on 2211 P1", () => {
    expect(entertainmentFbtSplits(11000, 1000)).toEqual([
      {
        glCode: "2210",
        gstCode: "P2",
        amountCents: 5500,
        note: "FBT 50-50: non-deductible half (no GST claim)",
      },
      {
        glCode: "2211",
        gstCode: "P1",
        amountCents: 5000,
        note: "FBT 50-50: deductible half (GST claimable)",
      },
    ])
  })
})

describe("netAmountAfterGstCents", () => {
  it("subtracts the GST amount from the total", () => {
    expect(netAmountAfterGstCents(11000, { vat: "10.00" })).toBe(10000)
  })

  it("derives GST from a 10 percent rate when no amount was entered", () => {
    expect(netAmountAfterGstCents(11000, { vat_rate: "10" })).toBe(10000)
  })

  it("leaves a GST-free total unchanged", () => {
    expect(netAmountAfterGstCents(22800, { vat: "0", vat_rate: "0" })).toBe(22800)
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
    convertedTotalCents: null,
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

  it("matches an FX receipt using the converted AUD total against the statement charge", () => {
    const fxReceipt: SapReceipt = {
      id: "fx1",
      issuedOn: "2026-09-12",
      totalCents: 10000,
      convertedTotalCents: 10600,
      vatCents: 0,
      merchant: "xAI",
      name: "Grok subscription",
      description: null,
      categoryCode: "2065",
      projectCode: null,
    }
    const matches = matchStatementLines(
      [
        {
          id: "s-fx",
          postedOn: "2026-09-13",
          narrative: "XAI GROK SUBSCRIPTION FOREIGN CURRENCY",
          amountCents: 10600,
          kind: "purchase",
        },
      ],
      [fxReceipt]
    )
    expect(matches[0].receipt?.id).toBe("fx1")
  })

  it("matches an FX receipt when only the foreign total is stored but the narrative matches", () => {
    const fxReceipt: SapReceipt = {
      id: "fx2",
      issuedOn: "2026-09-12",
      totalCents: 10000,
      convertedTotalCents: null,
      vatCents: 0,
      merchant: "xAI",
      name: "Grok subscription",
      description: null,
      categoryCode: "2065",
      projectCode: null,
    }
    const matches = matchStatementLines(
      [
        {
          id: "s-fx",
          postedOn: "2026-09-13",
          narrative: "XAI GROK SUBSCRIPTION FOREIGN CURRENCY",
          amountCents: 10600,
          kind: "purchase",
        },
      ],
      [fxReceipt]
    )
    expect(matches[0].receipt?.id).toBe("fx2")
  })

  it("does not match a Grok receipt to an unrelated subscription on a nearby amount", () => {
    const grok: SapReceipt = {
      id: "grok",
      issuedOn: "2026-09-17",
      totalCents: 10000,
      convertedTotalCents: 14013,
      vatCents: 0,
      merchant: "Grok xAI",
      name: "SuperGrok Plus subscription",
      description: "Monthly SuperGrok Plus subscription for September 17 to October 17, 2026.",
      categoryCode: "2065",
      projectCode: null,
    }
    const matches = matchStatementLines(
      [
        { id: "pulse", postedOn: "2026-09-14", narrative: "PULSEWAY SUBSCRIPTION DUBLIN (96.90 US dollar)", amountCents: 13560, kind: "purchase" },
        { id: "xai", postedOn: "2026-09-17", narrative: "GROK XAI WWW.GROK.COM CA", amountCents: 14613, kind: "purchase" },
      ],
      [grok]
    )
    expect(matches.find((match) => match.line.id === "pulse")?.receipt).toBeNull()
    expect(matches.find((match) => match.line.id === "xai")?.receipt?.id).toBe("grok")
  })

  it("gives a receipt to the line it fits best, not the first line in statement order", () => {
    const hdmi: SapReceipt = {
      id: "hdmi",
      issuedOn: "2026-09-16",
      totalCents: 6899,
      convertedTotalCents: null,
      vatCents: 0,
      merchant: "ZZLINKING",
      name: "Twozoh 2 m HDMI cables, 10-pack",
      description: "Purchase of a 10-pack of slim HDMI 2.0 cables. Order 503-4201088-0998231, paid by Visa ending in 0577.",
      categoryCode: "2047",
      projectCode: null,
    }
    const matches = matchStatementLines(
      [
        { id: "scorpion", postedOn: "2026-09-09", narrative: "SCORPION TECHNOLOGY CO CLAYTON", amountCents: 6900, kind: "purchase" },
        { id: "amazon", postedOn: "2026-09-17", narrative: "AMAZON MARKETPLACE AU SYDNEY", amountCents: 6899, kind: "purchase" },
      ],
      [hdmi]
    )
    expect(matches.find((match) => match.line.id === "amazon")?.receipt?.id).toBe("hdmi")
    expect(matches.find((match) => match.line.id === "scorpion")?.receipt).toBeNull()
  })

  it("matches on the foreign amount printed on the statement when the AUD gap is large", () => {
    const pulseway: SapReceipt = {
      id: "pulseway",
      issuedOn: "2026-09-14",
      totalCents: 9690,
      currencyCode: "USD",
      convertedTotalCents: 11000,
      vatCents: 0,
      merchant: "Pulseway",
      name: "Pulseway monthly subscription",
      description: null,
      categoryCode: "2065",
      projectCode: null,
    }
    const line = {
      id: "pw",
      postedOn: "2026-09-14",
      narrative: "PULSEWAY SUBSCRIPTION DUBLIN (96.90 US dollar)",
      amountCents: 13560,
      kind: "purchase" as const,
    }
    expect(matchStatementLines([line], [pulseway])[0].receipt?.id).toBe("pulseway")
    expect(matchStatementLines([line], [{ ...pulseway, currencyCode: "EUR" }])[0].receipt).toBeNull()
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

  it("expands 2210 or 2211 entertainment receipts into FBT 50-50 SAP rows", () => {
    const catalog = {
      categories: new Map([
        ["2210", "Entertainment - Non Deductible"],
        ["2211", "Entertainment - Deductible"],
      ]),
      projects: new Map<string, string>(),
      dimension: "ANNMAD",
    }
    const receipt: SapReceipt = {
      id: "coffee",
      issuedOn: "2026-09-10",
      totalCents: 5289,
      convertedTotalCents: null,
      vatCents: 477,
      merchant: "The Coffee Club",
      name: "Meal with clients",
      description: null,
      categoryCode: "2210",
      projectCode: null,
    }
    const rows = sapRowsForStatement(
      [
        {
          id: "s-coffee",
          postedOn: "2026-09-10",
          narrative: "THE COFFEE CLUB CREDIT CARD PURCHASE",
          amountCents: 5289,
          kind: "purchase",
        },
      ],
      [receipt],
      catalog
    )
    expect(rows.map((row) => [row.glCode, row.gstCode, row.amountCents])).toEqual([
      ["2210", "P2", 2645],
      ["2211", "P1", 2380],
      ["2211", "P2", 26],
    ])
    expect(rows[0].glName).toBe("Entertainment - Non Deductible")
    expect(rows[1].glName).toBe("Entertainment - Deductible")
  })
})

describe("classifyLine", () => {
  it("treats a card fee as a fee even if the model called it a purchase", () => {
    expect(classifyLine("CARD FEE FEES", "purchase")).toBe("fee")
  })
})
