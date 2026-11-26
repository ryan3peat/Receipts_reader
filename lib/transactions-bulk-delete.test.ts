import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  transaction: { findMany: vi.fn(), deleteMany: vi.fn(), count: vi.fn(), updateMany: vi.fn() },
  deleteFile: vi.fn(),
  getActor: vi.fn(),
}))

vi.mock("@/lib/db", () => ({ prisma: { transaction: mocks.transaction } }))
vi.mock("@/prisma/client", () => ({ Prisma: {} }))
vi.mock("@/lib/access", () => ({ getActor: mocks.getActor }))
vi.mock("@/models/files", () => ({ deleteFile: mocks.deleteFile }))
vi.mock("@/models/fields", () => ({ getFields: vi.fn(async () => []) }))

import { bulkDeleteTransactions, bulkSetTransactionStatus } from "@/models/transactions"

const company = "company"
const cardholder = { effectiveRole: "cardholder", user: { id: "cardholder-a" } }
const accounts = { effectiveRole: "accounts", user: { id: "accounts-a" } }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.transaction.deleteMany.mockImplementation(async ({ where }) => ({ count: where.id.in.length }))
  mocks.transaction.count.mockResolvedValue(0)
})

describe("bulkDeleteTransactions", () => {
  it("limits a cardholder to transactions they submitted", async () => {
    mocks.getActor.mockResolvedValue(cardholder)
    // The database only returns the caller's own row for the scoped lookup.
    mocks.transaction.findMany.mockResolvedValue([{ id: "mine", files: [] }])

    const result = await bulkDeleteTransactions(["mine", "someone-elses"], company)

    expect(mocks.transaction.findMany.mock.calls[0][0].where).toEqual({
      id: { in: ["mine", "someone-elses"] },
      userId: company,
      submittedById: "cardholder-a",
    })
    expect(mocks.transaction.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["mine"] }, userId: company } })
    expect(result).toEqual({ count: 1 })
  })

  it("deletes nothing when none of the requested rows belong to the cardholder", async () => {
    mocks.getActor.mockResolvedValue(cardholder)
    mocks.transaction.findMany.mockResolvedValue([])

    const result = await bulkDeleteTransactions(["someone-elses"], company)

    expect(result).toEqual({ count: 0 })
    expect(mocks.transaction.deleteMany).not.toHaveBeenCalled()
    expect(mocks.deleteFile).not.toHaveBeenCalled()
  })

  it("lets accounts delete any employee's transactions", async () => {
    mocks.getActor.mockResolvedValue(accounts)
    mocks.transaction.findMany.mockResolvedValue([
      { id: "a", files: [] },
      { id: "b", files: [] },
    ])

    const result = await bulkDeleteTransactions(["a", "b"], company)

    expect(mocks.transaction.findMany.mock.calls[0][0].where).not.toHaveProperty("submittedById")
    expect(result).toEqual({ count: 2 })
  })

  it("removes the receipt files of deleted transactions, once each", async () => {
    mocks.getActor.mockResolvedValue(accounts)
    mocks.transaction.findMany.mockResolvedValue([
      { id: "a", files: ["file-1", "file-2"] },
      { id: "b", files: ["file-2"] },
    ])

    await bulkDeleteTransactions(["a", "b"], company)

    expect(mocks.deleteFile.mock.calls).toEqual([
      ["file-1", company],
      ["file-2", company],
    ])
  })

  it("keeps a file that a surviving transaction still uses", async () => {
    mocks.getActor.mockResolvedValue(accounts)
    mocks.transaction.findMany.mockResolvedValue([{ id: "a", files: ["shared", "own"] }])
    mocks.transaction.count.mockImplementation(async ({ where }) =>
      where.files.array_contains[0] === "shared" ? 1 : 0
    )

    await bulkDeleteTransactions(["a"], company)

    expect(mocks.deleteFile.mock.calls).toEqual([["own", company]])
  })
})

describe("bulkSetTransactionStatus", () => {
  it("stays inside the company and never changes rows that were already exported", async () => {
    mocks.transaction.updateMany.mockResolvedValue({ count: 1 })

    const result = await bulkSetTransactionStatus(["a", "b"], company, "new")

    expect(mocks.transaction.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["a", "b"] }, userId: company, status: { not: "exported" } },
      data: { status: "new" },
    })
    expect(result).toEqual({ count: 1 })
  })
})
