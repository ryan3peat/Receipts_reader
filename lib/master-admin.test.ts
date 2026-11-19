import { beforeEach, describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({
  auth: { masterAdminEmail: null as string | null },
  loginRequired: false,
  cookies: {} as Record<string, string>,
  session: null as { user: { id: string } } | null,
  users: {} as Record<string, { id: string; email: string; role: string }>,
}))

vi.mock("@/lib/config", () => ({ default: { auth: state.auth } }))
vi.mock("@/lib/db", () => ({ prisma: {} }))
vi.mock("@/prisma/client", () => ({}))
vi.mock("@/lib/auth", () => ({ getSession: vi.fn(async () => state.session) }))
vi.mock("next/navigation", () => ({ redirect: vi.fn() }))
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) => (name in state.cookies ? { value: state.cookies[name] } : undefined),
  })),
}))
vi.mock("@/models/settings", () => ({
  getSettings: vi.fn(async () => ({ login_required: state.loginRequired ? "true" : "false" })),
  updateSettings: vi.fn(),
}))
vi.mock("@/models/users", () => ({
  getSelfHostedUser: vi.fn(async () => state.users.company),
  getOrCreateSelfHostedUser: vi.fn(async () => state.users.company),
  getUserById: vi.fn(async (id: string) => Object.values(state.users).find((user) => user.id === id) ?? null),
}))

import { requireMasterAdmin, resolveActor } from "@/lib/access"
import { ADMIN_BRIDGE_COOKIE, USER_VIEW_COOKIE } from "@/lib/access-cookies"
import { isMasterAdminEmail, isValidMasterAdminEmail } from "@/lib/master-admin"

const MASTER = "master@ef.test"

function signInAs(key: string) {
  state.loginRequired = true
  state.session = { user: { id: state.users[key].id } }
}

beforeEach(() => {
  state.auth.masterAdminEmail = MASTER
  state.loginRequired = false
  state.cookies = {}
  state.session = null
  state.users = {
    company: { id: "company", email: "taxhacker@localhost", role: "accounts" },
    master: { id: "master", email: MASTER, role: "accounts" },
    accounts: { id: "accounts", email: "accounts@ef.test", role: "accounts" },
    sales: { id: "sales", email: "sales@ef.test", role: "sales" },
  }
})

describe("isMasterAdminEmail", () => {
  it("matches the configured email whatever the letter case or padding", () => {
    expect(isMasterAdminEmail(MASTER)).toBe(true)
    expect(isMasterAdminEmail("  Master@EF.test ")).toBe(true)
  })

  it("matches nobody else", () => {
    expect(isMasterAdminEmail("accounts@ef.test")).toBe(false)
    expect(isMasterAdminEmail("")).toBe(false)
    expect(isMasterAdminEmail(null)).toBe(false)
    expect(isMasterAdminEmail(undefined)).toBe(false)
  })

  it("matches nobody when no Master Admin is configured", () => {
    state.auth.masterAdminEmail = null

    expect(isMasterAdminEmail(MASTER)).toBe(false)
    expect(isMasterAdminEmail("")).toBe(false)
  })
})

describe("isValidMasterAdminEmail", () => {
  it.each(["master@ef.test", "first.last@sub.ef.test"])("accepts %s", (email) => {
    expect(isValidMasterAdminEmail(email)).toBe(true)
  })

  it.each(["", "master", "master@localhost", "a b@ef.test", "@ef.test"])("rejects %j", (email) => {
    expect(isValidMasterAdminEmail(email)).toBe(false)
  })
})

describe("who counts as the Master Admin", () => {
  it("is the signed-in person with the configured email", async () => {
    signInAs("master")

    expect(await resolveActor()).toMatchObject({ isMaster: true, realRole: "accounts" })
  })

  it("is not another accounts person", async () => {
    signInAs("accounts")

    expect(await resolveActor()).toMatchObject({ isMaster: false, realRole: "accounts" })
  })

  it("is not a sales person", async () => {
    signInAs("sales")

    expect(await resolveActor()).toMatchObject({ isMaster: false, realRole: "sales" })
  })

  it("stays an accounts user even if the database says sales", async () => {
    state.users.master.role = "sales"
    signInAs("master")

    expect(await resolveActor()).toMatchObject({ isMaster: true, realRole: "accounts", effectiveRole: "accounts" })
  })

  it("is the default account while Login is off", async () => {
    expect(await resolveActor()).toMatchObject({ isMaster: true, user: { id: "company" } })
  })

  it("is the browser that turned Login on, which acts as the default account", async () => {
    state.loginRequired = true
    state.cookies[ADMIN_BRIDGE_COOKIE] = "company"

    expect(await resolveActor()).toMatchObject({ isMaster: true, user: { id: "company" } })
  })

  it("is nobody who is signed out once Login is on", async () => {
    state.loginRequired = true

    expect(await resolveActor()).toBeNull()
  })

  it("is not an accounts person when no Master Admin is configured", async () => {
    state.auth.masterAdminEmail = null
    signInAs("accounts")

    expect(await resolveActor()).toMatchObject({ isMaster: false })
  })
})

describe("requireMasterAdmin", () => {
  it("lets the Master Admin through", async () => {
    signInAs("master")

    expect(await requireMasterAdmin()).toMatchObject({ ok: true, actor: { user: { id: "master" } } })
  })

  it("refuses another accounts person", async () => {
    signInAs("accounts")

    expect(await requireMasterAdmin()).toEqual({ ok: false, error: "Only the Master Admin can do that" })
  })

  it("refuses a sales person", async () => {
    signInAs("sales")

    expect(await requireMasterAdmin()).toEqual({ ok: false, error: "Only accounts can do that" })
  })

  it("refuses the Master Admin while they are in User View", async () => {
    signInAs("master")
    state.cookies[USER_VIEW_COOKIE] = "1"

    expect(await requireMasterAdmin()).toEqual({ ok: false, error: "Only accounts can do that" })
  })
})
