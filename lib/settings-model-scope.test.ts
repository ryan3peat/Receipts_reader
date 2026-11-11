import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  category: { create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  project: { create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  field: { create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  currency: { create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  transaction: { updateMany: vi.fn() },
}))

vi.mock("@/lib/db", () => ({
  prisma: {
    category: mocks.category,
    project: mocks.project,
    field: mocks.field,
    currency: mocks.currency,
    transaction: mocks.transaction,
  },
}))

vi.mock("@/prisma/client", () => ({ Prisma: {} }))

import { createCategory, deleteCategory, updateCategory } from "@/models/categories"
import { createCurrency, deleteCurrency, updateCurrency } from "@/models/currencies"
import { createField, deleteField, updateField } from "@/models/fields"
import { createProject, deleteProject, updateProject } from "@/models/projects"

const userA = "user-a"
const userB = "user-b"

beforeEach(() => {
  vi.clearAllMocks()
  for (const model of [mocks.category, mocks.project, mocks.field, mocks.currency]) {
    model.update.mockResolvedValue({ id: "row" })
    model.delete.mockResolvedValue({ id: "row" })
    model.create.mockResolvedValue({ id: "row" })
  }
  mocks.transaction.updateMany.mockResolvedValue({ count: 0 })
})

describe.each([
  {
    name: "category",
    create: createCategory,
    update: updateCategory,
    remove: deleteCategory,
    prisma: mocks.category,
    payload: { name: "Travel", code: "travel", userId: userA, user: { connect: { id: userA } } },
  },
  {
    name: "project",
    create: createProject,
    update: updateProject,
    remove: deleteProject,
    prisma: mocks.project,
    payload: { name: "Travel", code: "travel", userId: userA, user: { connect: { id: userA } } },
  },
  {
    name: "field",
    create: createField,
    update: updateField,
    remove: deleteField,
    prisma: mocks.field,
    payload: { name: "Travel", code: "travel", userId: userA, user: { connect: { id: userA } } },
  },
  {
    name: "currency",
    create: createCurrency,
    update: updateCurrency,
    remove: deleteCurrency,
    prisma: mocks.currency,
    payload: { name: "US Dollar", code: "USD", userId: userA, user: { connect: { id: userA } } },
  },
])("user B $name queries stay on user B", (group) => {
  it("creates the row for the caller even if the payload names user A", async () => {
    await group.create(userB, group.payload)

    const data = group.prisma.create.mock.calls[0][0].data
    expect(data.user).toEqual({ connect: { id: userB } })
    expect(data.userId).toBeUndefined()
    expect(JSON.stringify(data)).not.toContain(userA)
  })

  it("updates only where the code and the caller id match", async () => {
    await group.update(userB, "travel", group.payload)

    expect(group.prisma.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_code: { code: "travel", userId: userB } },
      })
    )
    const call = group.prisma.update.mock.calls[0][0]
    expect(JSON.stringify(call.where)).not.toContain(userA)
    expect(call.data.userId).toBeUndefined()
    expect(call.data.user).toBeUndefined()
  })

  it("deletes only where the code and the caller id match", async () => {
    await group.remove(userB, "travel")

    expect(group.prisma.delete).toHaveBeenCalledWith({
      where: { userId_code: { code: "travel", userId: userB } },
    })
  })
})
