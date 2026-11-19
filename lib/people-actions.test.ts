import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  auth: { masterAdminEmail: "master@ef.test" as string | null },
  user: { create: vi.fn(), count: vi.fn(), update: vi.fn() },
}))

vi.mock("@/lib/config", () => ({ default: { auth: mocks.auth } }))
vi.mock("@/lib/db", () => ({ prisma: { user: mocks.user } }))
vi.mock("@/lib/access", () => ({ getActor: vi.fn(), requireMasterAdmin: vi.fn(), setLoginRequired: vi.fn() }))
vi.mock("@/models/users", () => ({ getUserByEmail: vi.fn(), getUserById: vi.fn(), ensureMasterAdminUser: vi.fn() }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("next/headers", () => ({ cookies: vi.fn() }))

import { setLoginRequiredAction } from "@/app/(app)/access/actions"
import { addMemberAction, updateMemberRoleAction } from "@/app/(app)/settings/users/actions"
import { requireMasterAdmin, setLoginRequired } from "@/lib/access"
import { ensureMasterAdminUser, getUserByEmail, getUserById } from "@/models/users"

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

  it("defaults to sales when the role is missing or unknown", async () => {
    await addMemberAction(null, person({ email: "new@ef.test", name: "New", role: "owner" }))

    expect(mocks.user.create.mock.calls[0][0].data.role).toBe("sales")
  })

  it("always adds the Master Admin as accounts", async () => {
    await addMemberAction(null, person({ email: "Master@EF.test", name: "Boss", role: "sales" }))

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
    const result = await updateMemberRoleAction("member", "sales")

    expect(result).toEqual({ success: true })
    expect(mocks.user.update).toHaveBeenCalledWith({ where: { id: "member" }, data: { role: "sales" } })
  })

  it("never demotes the Master Admin", async () => {
    vi.mocked(getUserById).mockResolvedValue({ id: "boss", email: "master@ef.test" } as Found)

    const result = await updateMemberRoleAction("boss", "sales")

    expect(result).toEqual({ success: false, error: "The Master Admin stays an admin" })
    expect(mocks.user.update).not.toHaveBeenCalled()
  })

  it("never demotes the default account", async () => {
    const result = await updateMemberRoleAction("company", "sales")

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

    const result = await updateMemberRoleAction("member", "sales")

    expect(result).toEqual({ success: false, error: "Keep at least one accounts user" })
    expect(mocks.user.update).not.toHaveBeenCalled()
  })
})

describe("setLoginRequiredAction", () => {
  it.each([true, false])("refuses anyone who is not the Master Admin (switching to %s)", async (enabled) => {
    vi.mocked(requireMasterAdmin).mockResolvedValue(refused)

    const result = await setLoginRequiredAction(enabled)

    expect(result).toEqual({ success: false, error: "Only the Master Admin can do that" })
    expect(ensureMasterAdminUser).not.toHaveBeenCalled()
    expect(setLoginRequired).not.toHaveBeenCalled()
  })

  it("will not turn Login on until a Master Admin is configured", async () => {
    mocks.auth.masterAdminEmail = null

    const result = await setLoginRequiredAction(true)

    expect(result).toEqual({ success: false, error: "Set MASTER_ADMIN_EMAIL before turning Login on" })
    expect(setLoginRequired).not.toHaveBeenCalled()
  })

  it("will not turn Login on with a Master Admin email nobody could sign in with", async () => {
    mocks.auth.masterAdminEmail = "master@localhost"

    const result = await setLoginRequiredAction(true)

    expect(result).toEqual({ success: false, error: "MASTER_ADMIN_EMAIL is not a valid email address" })
    expect(ensureMasterAdminUser).not.toHaveBeenCalled()
    expect(setLoginRequired).not.toHaveBeenCalled()
  })

  it("makes sure the Master Admin can sign in before turning Login on", async () => {
    const order: string[] = []
    vi.mocked(ensureMasterAdminUser).mockImplementation(async () => {
      order.push("ensure")
      return {} as Awaited<ReturnType<typeof ensureMasterAdminUser>>
    })
    vi.mocked(setLoginRequired).mockImplementation(async () => {
      order.push("login")
    })

    const result = await setLoginRequiredAction(true)

    expect(result).toEqual({ success: true })
    expect(ensureMasterAdminUser).toHaveBeenCalledWith("master@ef.test")
    expect(setLoginRequired).toHaveBeenCalledWith(true)
    expect(order).toEqual(["ensure", "login"])
  })

  it("turns Login off without touching any account", async () => {
    mocks.auth.masterAdminEmail = null

    const result = await setLoginRequiredAction(false)

    expect(result).toEqual({ success: true })
    expect(ensureMasterAdminUser).not.toHaveBeenCalled()
    expect(setLoginRequired).toHaveBeenCalledWith(false)
  })
})
