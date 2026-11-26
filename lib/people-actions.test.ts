import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  auth: { masterAdminEmail: "master@ef.test" as string | null },
  user: { create: vi.fn(), count: vi.fn(), update: vi.fn() },
}))

vi.mock("@/lib/config", () => ({ default: { auth: mocks.auth } }))
vi.mock("@/lib/db", () => ({ prisma: { user: mocks.user } }))
vi.mock("@/lib/access", () => ({ getActor: vi.fn(), requireMasterAdmin: vi.fn() }))
vi.mock("@/models/users", () => ({ getUserByEmail: vi.fn(), getUserById: vi.fn() }))
vi.mock("@/models/gl-departments", () => ({ setPersonDepartments: vi.fn() }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

import { addMemberAction, updateMemberRoleAction } from "@/app/(app)/settings/users/actions"
import { requireMasterAdmin } from "@/lib/access"
import { getUserByEmail, getUserById } from "@/models/users"

type Gate = Awaited<ReturnType<typeof requireMasterAdmin>>
type Found = Awaited<ReturnType<typeof getUserById>>

const refused = { ok: false, error: "Only the Master Admin can do that" } as Gate

function person(fields: Record<string, string>) {
  const form = new FormData()
  for (const [key, value] of Object.entries(fields)) form.set(key, value)
  return form
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.auth.masterAdminEmail = "master@ef.test"
  vi.mocked(requireMasterAdmin).mockResolvedValue({ ok: true, actor: { companyUser: { id: "company" } } } as Gate)
  vi.mocked(getUserByEmail).mockResolvedValue(null)
  vi.mocked(getUserById).mockResolvedValue({ id: "member", email: "member@ef.test" } as Found)
  mocks.user.count.mockResolvedValue(2)
})

describe("addMemberAction", () => {
  it("refuses anyone who is not the Master Admin, before touching the database", async () => {
    vi.mocked(requireMasterAdmin).mockResolvedValue(refused)

    const result = await addMemberAction(null, person({ email: "new@ef.test", name: "New", role: "accounts" }))

    expect(result).toEqual({ success: false, error: "Only the Master Admin can do that" })
    expect(getUserByEmail).not.toHaveBeenCalled()
    expect(mocks.user.create).not.toHaveBeenCalled()
  })

  it("adds a person with the chosen role and a lower-case email", async () => {
    const result = await addMemberAction(null, person({ email: " New@EF.test ", name: "New", role: "accounts" }))

    expect(result).toEqual({ success: true })
    expect(mocks.user.create).toHaveBeenCalledWith({
      data: { email: "new@ef.test", name: "New", role: "accounts", membershipPlan: "unlimited", emailVerified: true },
    })
  })

  it("defaults to cardholder when the role is missing or unknown", async () => {
    await addMemberAction(null, person({ email: "new@ef.test", name: "New", role: "owner" }))

    expect(mocks.user.create.mock.calls[0][0].data.role).toBe("cardholder")
  })

  it("always adds the Master Admin as accounts", async () => {
    await addMemberAction(null, person({ email: "Master@EF.test", name: "Boss", role: "cardholder" }))

    expect(mocks.user.create.mock.calls[0][0].data).toMatchObject({ email: "master@ef.test", role: "accounts" })
  })

  it("refuses an email that already has an account", async () => {
    vi.mocked(getUserByEmail).mockResolvedValue({ id: "member" } as Found)

    const result = await addMemberAction(null, person({ email: "member@ef.test", name: "Member" }))

    expect(result).toEqual({ success: false, error: "That email already has an account" })
    expect(mocks.user.create).not.toHaveBeenCalled()
  })
})

describe("updateMemberRoleAction", () => {
  it("refuses anyone who is not the Master Admin, before touching the database", async () => {
    vi.mocked(requireMasterAdmin).mockResolvedValue(refused)

    const result = await updateMemberRoleAction("member", "accounts")

    expect(result).toEqual({ success: false, error: "Only the Master Admin can do that" })
    expect(getUserById).not.toHaveBeenCalled()
    expect(mocks.user.update).not.toHaveBeenCalled()
  })

  it("changes a person's role", async () => {
    const result = await updateMemberRoleAction("member", "cardholder")

    expect(result).toEqual({ success: true })
    expect(mocks.user.update).toHaveBeenCalledWith({ where: { id: "member" }, data: { role: "cardholder" } })
  })

  it("never demotes the Master Admin", async () => {
    vi.mocked(getUserById).mockResolvedValue({ id: "boss", email: "master@ef.test" } as Found)

    const result = await updateMemberRoleAction("boss", "cardholder")

    expect(result).toEqual({ success: false, error: "The Master Admin stays an admin" })
    expect(mocks.user.update).not.toHaveBeenCalled()
  })

  it("never demotes the default account", async () => {
    const result = await updateMemberRoleAction("company", "cardholder")

    expect(result).toEqual({ success: false, error: "The default account stays an admin" })
    expect(mocks.user.update).not.toHaveBeenCalled()
  })

  it("refuses a person who no longer exists", async () => {
    vi.mocked(getUserById).mockResolvedValue(null)

    const result = await updateMemberRoleAction("gone", "accounts")

    expect(result).toEqual({ success: false, error: "Not found" })
    expect(mocks.user.update).not.toHaveBeenCalled()
  })

  it("keeps at least one accounts user", async () => {
    mocks.user.count.mockResolvedValue(0)

    const result = await updateMemberRoleAction("member", "cardholder")

    expect(result).toEqual({ success: false, error: "Keep at least one accounts user" })
    expect(mocks.user.update).not.toHaveBeenCalled()
  })
})
