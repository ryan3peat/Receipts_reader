import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  field: { findMany: vi.fn(), upsert: vi.fn() },
}))

vi.mock("@/lib/db", () => ({ prisma: { field: mocks.field } }))

import { DEFAULT_FIELDS } from "@/models/defaults-data"
import { ensureDefaultFields } from "@/models/defaults"

beforeEach(() => {
  vi.clearAllMocks()
  mocks.field.upsert.mockResolvedValue({ id: "field" })
})

describe("ensureDefaultFields", () => {
  it("includes Net Amount after GST in the default column list", () => {
    expect(DEFAULT_FIELDS.find((field) => field.code === "netAmountAfterGst")?.name).toBe("Net Amount after GST")
  })

  it("adds only fields this account does not have yet", async () => {
    mocks.field.findMany.mockResolvedValue(
      DEFAULT_FIELDS.filter((field) => field.code !== "netAmountAfterGst").map((field) => ({ code: field.code }))
    )

    await ensureDefaultFields("user-1")

    expect(mocks.field.upsert).toHaveBeenCalledTimes(1)
    expect(mocks.field.upsert).toHaveBeenCalledWith({
      where: { userId_code: { code: "netAmountAfterGst", userId: "user-1" } },
      update: {},
      create: expect.objectContaining({
        code: "netAmountAfterGst",
        name: "Net Amount after GST",
        userId: "user-1",
        isVisibleInList: false,
        isExtra: false,
      }),
    })
  })

  it("leaves an account that already has every default field unchanged", async () => {
    mocks.field.findMany.mockResolvedValue(DEFAULT_FIELDS.map((field) => ({ code: field.code })))

    await ensureDefaultFields("user-1")

    expect(mocks.field.upsert).not.toHaveBeenCalled()
  })
})
