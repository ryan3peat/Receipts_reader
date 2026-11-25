import { beforeEach, describe, expect, it, vi } from "vitest"

const TENANT = "11111111-2222-3333-4444-555555555555"
const OTHER_TENANT = "99999999-8888-7777-6666-555555555555"

const mocks = vi.hoisted(() => ({
  auth: {
    masterAdminEmail: "master@ef.test" as string | null,
    microsoft: { tenantId: "" } as { tenantId: string } | null,
  },
  user: { findUnique: vi.fn(), create: vi.fn() },
}))

vi.mock("@/lib/config", () => ({ default: { auth: mocks.auth } }))
vi.mock("@/lib/db", () => ({ prisma: { user: mocks.user } }))

import { emailToEnrol, enrolOnFirstSignIn, getCompanyEmailDomain } from "@/lib/sign-in-enrolment"

const staff = { email: "Jo.Bloggs@EF.test", name: "Jo Bloggs", tid: TENANT }

beforeEach(() => {
  vi.resetAllMocks()
  mocks.auth.masterAdminEmail = "master@ef.test"
  mocks.auth.microsoft = { tenantId: TENANT }
  mocks.user.findUnique.mockResolvedValue(null)
  vi.spyOn(console, "error").mockImplementation(() => {})
})

describe("getCompanyEmailDomain", () => {
  it("is the Master Admin's email domain", () => {
    expect(getCompanyEmailDomain()).toBe("ef.test")
  })

  it.each([null, "master", "master@localhost"])("is unknown when the Master Admin is %j", (email) => {
    mocks.auth.masterAdminEmail = email

    expect(getCompanyEmailDomain()).toBeNull()
  })
})

describe("emailToEnrol", () => {
  it("accepts a company address from the company's own Microsoft tenant", () => {
    expect(emailToEnrol(staff)).toBe("jo.bloggs@ef.test")
  })

  it("accepts the tenant id in any letter case", () => {
    mocks.auth.microsoft = { tenantId: "ABCDEF12-2222-3333-4444-555555555555" }

    expect(emailToEnrol({ ...staff, tid: "abcdef12-2222-3333-4444-555555555555" })).toBe("jo.bloggs@ef.test")
  })

  it.each([
    "guest@gmail.com",
    "jo@ef.test.evil.com",
    "jo@mail.ef.test",
    "jo@notef.test",
    "jo@evil.com@ef.test",
    "jo bloggs@ef.test",
    "ef.test",
    "",
  ])("refuses the address %j", (email) => {
    expect(emailToEnrol({ ...staff, email })).toBeNull()
  })

  it("refuses a company address presented from another tenant", () => {
    expect(emailToEnrol({ ...staff, tid: OTHER_TENANT })).toBeNull()
  })

  it.each([undefined, null, 42, ""])("refuses a profile whose tenant is %j", (tid) => {
    expect(emailToEnrol({ ...staff, tid })).toBeNull()
  })

  it.each([undefined, null, 42])("refuses a profile whose email is %j", (email) => {
    expect(emailToEnrol({ ...staff, email })).toBeNull()
  })

  it.each(["common", "organizations", "consumers", "ef.onmicrosoft.com"])(
    "refuses everyone when sign-in is not tied to one tenant id (%s)",
    (tenantId) => {
      mocks.auth.microsoft = { tenantId }

      expect(emailToEnrol({ ...staff, tid: tenantId })).toBeNull()
    }
  )

  it("refuses everyone when Microsoft sign-in is not configured", () => {
    mocks.auth.microsoft = null

    expect(emailToEnrol(staff)).toBeNull()
  })

  it("refuses everyone when no Master Admin is configured", () => {
    mocks.auth.masterAdminEmail = null

    expect(emailToEnrol(staff)).toBeNull()
  })
})

describe("enrolOnFirstSignIn", () => {
  it("creates a Cardholder account, already verified, with the name from Microsoft", async () => {
    await enrolOnFirstSignIn(staff)

    expect(mocks.user.findUnique).toHaveBeenCalledWith({ where: { email: "jo.bloggs@ef.test" }, select: { id: true } })
    expect(mocks.user.create).toHaveBeenCalledTimes(1)
    expect(mocks.user.create).toHaveBeenCalledWith({
      data: {
        email: "jo.bloggs@ef.test",
        name: "Jo Bloggs",
        role: "cardholder",
        membershipPlan: "unlimited",
        emailVerified: true,
      },
    })
  })

  it("never creates an Accounts user, whatever the profile claims", async () => {
    await enrolOnFirstSignIn({ ...staff, role: "accounts", isAdmin: true } as typeof staff)

    expect(mocks.user.create.mock.calls[0][0].data.role).toBe("cardholder")
  })

  it("creates the Master Admin as Accounts", async () => {
    await enrolOnFirstSignIn({ ...staff, email: "Master@EF.test" })

    expect(mocks.user.create.mock.calls[0][0].data).toMatchObject({ email: "master@ef.test", role: "accounts" })
  })

  it.each([undefined, "", "   ", 42])("falls back to the email when the name is %j", async (name) => {
    await enrolOnFirstSignIn({ ...staff, name })

    expect(mocks.user.create.mock.calls[0][0].data.name).toBe("jo.bloggs@ef.test")
  })

  it("leaves an existing person untouched, including their role", async () => {
    mocks.user.findUnique.mockResolvedValue({ id: "existing" })

    await enrolOnFirstSignIn(staff)

    expect(mocks.user.create).not.toHaveBeenCalled()
  })

  it("does not touch the database for someone who may not enrol", async () => {
    await enrolOnFirstSignIn({ ...staff, email: "guest@gmail.com" })
    await enrolOnFirstSignIn({ ...staff, tid: OTHER_TENANT })

    expect(mocks.user.findUnique).not.toHaveBeenCalled()
    expect(mocks.user.create).not.toHaveBeenCalled()
  })

  it("does not break sign-in when the database fails", async () => {
    mocks.user.create.mockRejectedValue(new Error("unique constraint"))

    await expect(enrolOnFirstSignIn(staff)).resolves.toBeUndefined()
  })
})
