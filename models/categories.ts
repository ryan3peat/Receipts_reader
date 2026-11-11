import { prisma } from "@/lib/db"
import { codeFromName } from "@/lib/utils"
import { Prisma } from "@/prisma/client"
import { cache } from "react"

export type CategoryData = {
  [key: string]: unknown
}

export const getCategories = cache(async (userId: string) => {
  return await prisma.category.findMany({
    where: { userId },
    orderBy: {
      name: "asc",
    },
  })
})

export const getCategoryByCode = cache(async (userId: string, code: string) => {
  return await prisma.category.findUnique({
    where: { userId_code: { userId, code } },
  })
})

export const createCategory = async (userId: string, category: CategoryData) => {
  const fields = withoutOwner(category)
  if (!fields.code) {
    fields.code = codeFromName(fields.name as string)
  }
  return await prisma.category.create({
    data: {
      ...fields,
      user: {
        connect: {
          id: userId,
        },
      },
    } as Prisma.CategoryCreateInput,
  })
}

export const updateCategory = async (userId: string, code: string, category: CategoryData) => {
  return await prisma.category.update({
    where: { userId_code: { userId, code } },
    data: withoutOwner(category),
  })
}

export const deleteCategory = async (userId: string, code: string) => {
  await prisma.transaction.updateMany({
    where: {
      userId,
      categoryCode: code,
    },
    data: {
      categoryCode: null,
    },
  })

  return await prisma.category.delete({
    where: { userId_code: { userId, code } },
  })
}

function withoutOwner(data: CategoryData): CategoryData {
  const { userId: _userId, user: _user, ...fields } = data
  return fields
}
