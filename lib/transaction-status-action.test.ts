import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn(), isSubscriptionExpired: vi.fn() }))
vi.mock("@/lib/access", () => ({ requireAccounts: vi.fn() }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/files", () => ({}))
vi.mock("@/models/fields", () => ({ updateField: vi.fn() }))
vi.mock("@/models/files", () => ({ createFile: vi.fn(), deleteFile: vi.fn() }))
vi.mock("@/models/users", () => ({ updateUser: vi.fn() }))
vi.mock("@/models/transactions", () => ({ bulkSetTransactionStatus: vi.fn() }))

import { bulkSetTransactionStatusAction } from "@/app/(app)/transactions/actions"
import { requireAccounts } from "@/lib/access"
import { getCurrentUser } from "@/lib/auth"
import { bulkSetTransactionStatus } from "@/models/transactions"
import type { User } from "@/prisma/client"
import { revalidatePath } from "next/cache"

type Gate = Awaited<ReturnType<typeof requireAccounts>>

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(requireAccounts).mockResolvedValue({ ok: true } as Gate)
  vi.mocked(getCurrentUser).mockResolvedValue({ id: "company" } as User)
  vi.mocked(bulkSetTransactionStatus).mockResolvedValue({ count: 2 })
})

describe("bulkSetTransactionStatusAction", () => {
  it("refuses a sales user before touching any transaction", async () => {
    vi.mocked(requireAccounts).mockResolvedValue({ ok: false, error: "Only accounts can do that" } as Gate)

    const result = await bulkSetTransactionStatusAction(["a"], "reviewed")

    expect(result).toEqual({ success: false, error: "Only accounts can do that" })
    expect(bulkSetTransactionStatus).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it.each(["exported", "approved", "", undefined])("refuses the status %j, which cannot be set by hand", async (status) => {
    const result = await bulkSetTransactionStatusAction(["a"], status as string)

    expect(result).toEqual({ success: false, error: "Unknown status" })
    expect(bulkSetTransactionStatus).not.toHaveBeenCalled()
  })

  it("updates the selected rows for the company and reports how many were skipped", async () => {
    const result = await bulkSetTransactionStatusAction(["a", "b", "b", "c"], "reviewed")

    expect(bulkSetTransactionStatus).toHaveBeenCalledWith(["a", "b", "c"], "company", "reviewed")
    expect(result).toEqual({ success: true, count: 2, skipped: 1 })
    expect(revalidatePath).toHaveBeenCalledWith("/transactions")
    expect(revalidatePath).toHaveBeenCalledWith("/employees")
  })

  it("ignores ids that are not strings", async () => {
    await bulkSetTransactionStatusAction(["a", 5, null, { id: "x" }] as unknown as string[], "new")

    expect(bulkSetTransactionStatus).toHaveBeenCalledWith(["a"], "company", "new")
  })
})
