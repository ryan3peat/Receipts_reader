import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  user: { findFirst: vi.fn(), upsert: vi.fn() },
}))

vi.mock("@/lib/db", () => ({ prisma: { user: mocks.user } }))
vi.mock("@/prisma/client", () => ({ Prisma: {} }))
vi.mock("@/models/defaults", () => ({ isDatabaseEmpty: vi.fn(), createUserDefaults: vi.fn() }))

import { getOrCreateSelfHostedUser, getSelfHostedUser, SELF_HOSTED_USER } from "@/models/users"

type Row = { id: string; email: string }

// Stands in for the users table: answers the email lookup and the "earliest user" lookup.
function usersTable(rows: Row[]) {
  mocks.user.findFirst.mockImplementation(async (args: { where?: { email?: string } }) => {
    if (args.where?.email) return rows.find((row) => row.email === args.where!.email) ?? null
    return rows[0] ?? null
  })
}

const original = { id: "company", email: SELF_HOSTED_USER.email }
const renamed = { id: "company", email: "ryan@ef.test" }
const member = { id: "member", email: "sales@ef.test" }
const savedUrl = process.env.DATABASE_URL

beforeEach(() => {
  vi.clearAllMocks()
  process.env.DATABASE_URL = "postgresql://unused"
  mocks.user.upsert.mockResolvedValue({ id: "new", email: SELF_HOSTED_USER.email })
})

afterEach(() => {
  if (savedUrl === undefined) delete process.env.DATABASE_URL
  else process.env.DATABASE_URL = savedUrl
})

describe("getSelfHostedUser", () => {
  it("finds the default account by its original email", async () => {
    usersTable([original, member])

    expect(await getSelfHostedUser()).toEqual(original)
  })

  it("still finds the default account after its email was changed in Profile", async () => {
    usersTable([renamed, member])

    expect(await getSelfHostedUser()).toEqual(renamed)
    expect(mocks.user.findFirst).toHaveBeenLastCalledWith({ orderBy: [{ createdAt: "asc" }, { id: "asc" }] })
  })

  it("returns nothing on an empty database", async () => {
    usersTable([])

    expect(await getSelfHostedUser()).toBeNull()
  })

  it("returns nothing without a database, and does not query", async () => {
    delete process.env.DATABASE_URL

    expect(await getSelfHostedUser()).toBeNull()
    expect(mocks.user.findFirst).not.toHaveBeenCalled()
  })
})

describe("getOrCreateSelfHostedUser", () => {
  it("does not create a second, empty default account once the email was changed", async () => {
    usersTable([renamed, member])

    expect(await getOrCreateSelfHostedUser()).toEqual(renamed)
    expect(mocks.user.upsert).not.toHaveBeenCalled()
  })

  it("creates the default account on an empty database", async () => {
    usersTable([])

    expect(await getOrCreateSelfHostedUser()).toEqual({ id: "new", email: SELF_HOSTED_USER.email })
    expect(mocks.user.upsert).toHaveBeenCalledWith({
      where: { email: SELF_HOSTED_USER.email },
      update: SELF_HOSTED_USER,
      create: SELF_HOSTED_USER,
    })
  })

  it("keeps the existing upsert when the email is unchanged", async () => {
    usersTable([original, member])

    await getOrCreateSelfHostedUser()

    expect(mocks.user.upsert).toHaveBeenCalledTimes(1)
  })
})
