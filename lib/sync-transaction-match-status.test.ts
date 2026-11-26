import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findManyLines: vi.fn(),
  findManyTx: vi.fn(),
  updateMany: vi.fn(),
}))

vi.mock("@/lib/db", () => ({
  prisma: {
    cardStatementLine: { findMany: mocks.findManyLines },
    transaction: { findMany: mocks.findManyTx, updateMany: mocks.updateMany },
  },
}))

import { syncTransactionStatusesFromMatches } from "@/lib/sync-transaction-match-status"

beforeEach(() => {
  vi.resetAllMocks()
  mocks.updateMany.mockResolvedValue({ count: 0 })
})

describe("syncTransactionStatusesFromMatches", () => {
  it("sets linked receipts to matched and the rest to To Review, skipping exported", async () => {
    mocks.findManyLines.mockResolvedValue([{ transactionId: "a" }, { transactionId: "a" }])
    mocks.findManyTx.mockResolvedValue([{ id: "a" }, { id: "b" }])

    const result = await syncTransactionStatusesFromMatches("company", ["a", "b", "a"])

    expect(mocks.findManyTx).toHaveBeenCalledWith({
      where: { userId: "company", id: { in: ["a", "b"] }, status: { not: "exported" } },
      select: { id: true },
    })
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { userId: "company", id: { in: ["a"] }, status: { not: "exported" } },
      data: { status: "matched" },
    })
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { userId: "company", id: { in: ["b"] }, status: { not: "exported" } },
      data: { status: "new" },
    })
    expect(result).toEqual({ matched: 1, toReview: 1 })
  })

  it("no-ops on an empty id list", async () => {
    await expect(syncTransactionStatusesFromMatches("company", [])).resolves.toEqual({ matched: 0, toReview: 0 })
    expect(mocks.findManyLines).not.toHaveBeenCalled()
  })
})
