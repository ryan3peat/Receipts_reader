import type { Field, Transaction } from "@/prisma/client"
import { describe, expect, it } from "vitest"
import { summarizeEmployees, totalEmployeeSummaries } from "./employee-summary"

const members = [
  { id: "zoe", name: "Zoe", email: "zoe@ef.test", role: "sales" },
  { id: "adam", name: "Adam", email: "adam@ef.test", role: "sales" },
  { id: "acct", name: "", email: "accounts@ef.test", role: "accounts" },
]

const fields = [
  { code: "name", isRequired: true, isExtra: false },
  { code: "cost_center", isRequired: true, isExtra: true },
  { code: "note", isRequired: false, isExtra: false },
] as Field[]

const tx = (over: Partial<Transaction>): Transaction =>
  ({
    id: Math.random().toString(36),
    submittedById: "adam",
    name: "Lunch",
    total: 1000,
    currencyCode: "SGD",
    convertedTotal: null,
    convertedCurrencyCode: null,
    type: "expense",
    status: "new",
    files: ["file-1"],
    extra: { cost_center: "CC100" },
    createdAt: new Date("2026-11-01T00:00:00Z"),
    ...over,
  }) as Transaction

describe("summarizeEmployees", () => {
  it("lists every member, even with no activity, sorted by name", () => {
    const rows = summarizeEmployees(members, [], [], fields)

    expect(rows.map((row) => row.name)).toEqual(["accounts@ef.test", "Adam", "Zoe"])
    expect(rows.every((row) => row.receipts === 0 && row.pendingFiles === 0 && row.lastUploadAt === null)).toBe(true)
  })

  it("counts receipts and sums expense totals per employee and currency", () => {
    const rows = summarizeEmployees(
      members,
      [
        tx({ total: 1000 }),
        tx({ total: 2550 }),
        tx({ total: 9900, currencyCode: "USD" }),
        tx({ submittedById: "zoe", total: 400 }),
      ],
      [],
      fields
    )
    const adam = rows.find((row) => row.id === "adam")!
    const zoe = rows.find((row) => row.id === "zoe")!

    expect(adam.receipts).toBe(3)
    expect(adam.expenseTotals).toEqual({ SGD: 3550, USD: 9900 })
    expect(zoe.receipts).toBe(1)
    expect(zoe.expenseTotals).toEqual({ SGD: 400 })
  })

  it("uses the converted amount when one exists and leaves non-expenses out of the total", () => {
    const [adam] = summarizeEmployees(
      [members[1]],
      [
        tx({ total: 5000, currencyCode: "USD", convertedTotal: 6700, convertedCurrencyCode: "SGD" }),
        tx({ total: 8000, type: "income" }),
      ],
      [],
      fields
    )

    expect(adam.receipts).toBe(2)
    expect(adam.expenseTotals).toEqual({ SGD: 6700 })
  })

  it("counts receipts by status and treats an unknown status as still to review", () => {
    const rows = summarizeEmployees(
      members,
      [
        tx({ status: "new" }),
        tx({ status: "reviewed" }),
        tx({ status: "reviewed" }),
        tx({ status: "exported" }),
        tx({ status: "garbage" }),
        tx({ submittedById: "zoe", status: "exported" }),
      ],
      [],
      fields
    )

    expect(rows.find((row) => row.id === "adam")!.statusCounts).toEqual({ new: 2, reviewed: 2, exported: 1 })
    expect(rows.find((row) => row.id === "zoe")!.statusCounts).toEqual({ new: 0, reviewed: 0, exported: 1 })
    expect(totalEmployeeSummaries(rows).statusCounts).toEqual({ new: 2, reviewed: 2, exported: 2 })
  })

  it("flags incomplete receipts and receipts with no file attached", () => {
    const [adam] = summarizeEmployees(
      [members[1]],
      [
        tx({}),
        tx({ name: "" }),
        tx({ extra: {} }),
        tx({ files: [] }),
      ],
      [],
      fields
    )

    expect(adam.incomplete).toBe(2)
    expect(adam.withoutFile).toBe(1)
  })

  it("counts pending files and reports the most recent upload across receipts and pending files", () => {
    const [adam] = summarizeEmployees(
      [members[1]],
      [tx({ createdAt: new Date("2026-11-03T00:00:00Z") }), tx({ createdAt: new Date("2026-11-01T00:00:00Z") })],
      [
        { submittedById: "adam", createdAt: new Date("2026-11-09T00:00:00Z") },
        { submittedById: "adam", createdAt: new Date("2026-11-05T00:00:00Z") },
      ],
      fields
    )

    expect(adam.pendingFiles).toBe(2)
    expect(adam.lastUploadAt).toEqual(new Date("2026-11-09T00:00:00Z"))
  })

  it("collects records with no submitter, or a removed submitter, in one unassigned row placed last", () => {
    const rows = summarizeEmployees(
      members,
      [tx({ submittedById: null }), tx({ submittedById: "removed-user", total: 300 })],
      [{ submittedById: null, createdAt: new Date("2026-11-02T00:00:00Z") }],
      fields
    )
    const last = rows.at(-1)!

    expect(rows).toHaveLength(4)
    expect(last).toMatchObject({ id: null, name: "Unassigned", receipts: 2, pendingFiles: 1 })
    expect(last.expenseTotals).toEqual({ SGD: 1300 })
  })

  it("adds no unassigned row when every record has a known submitter", () => {
    const rows = summarizeEmployees(members, [tx({})], [], fields)

    expect(rows.some((row) => row.id === null)).toBe(false)
  })
})

describe("totalEmployeeSummaries", () => {
  it("adds counts and per-currency totals across rows", () => {
    const rows = summarizeEmployees(
      members,
      [tx({ total: 1000 }), tx({ submittedById: "zoe", total: 500, files: [] }), tx({ submittedById: "zoe", total: 700, currencyCode: "USD" })],
      [{ submittedById: "zoe", createdAt: new Date("2026-11-02T00:00:00Z") }],
      fields
    )

    expect(totalEmployeeSummaries(rows)).toEqual({
      receipts: 3,
      statusCounts: { new: 3, reviewed: 0, exported: 0 },
      incomplete: 0,
      withoutFile: 1,
      pendingFiles: 1,
      expenseTotals: { SGD: 1500, USD: 700 },
    })
  })
})
