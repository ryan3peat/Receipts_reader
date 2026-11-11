import { prisma } from "@/lib/db"
import { codeFromName } from "@/lib/utils"
import { Prisma } from "@/prisma/client"
import { cache } from "react"

export type FieldData = {
  [key: string]: unknown
}

export const getFields = cache(async (userId: string) => {
  return await prisma.field.findMany({
    where: { userId },
    orderBy: {
      createdAt: "asc",
    },
  })
})

export const createField = async (userId: string, field: FieldData) => {
  const fields = withoutOwner(field)
  if (!fields.code) {
    fields.code = codeFromName(fields.name as string)
  }
  return await prisma.field.create({
    data: {
      ...fields,
      user: {
        connect: {
          id: userId,
        },
      },
    } as Prisma.FieldCreateInput,
  })
}

export const updateField = async (userId: string, code: string, field: FieldData) => {
  return await prisma.field.update({
    where: { userId_code: { code, userId } },
    data: withoutOwner(field),
  })
}

export const deleteField = async (userId: string, code: string) => {
  return await prisma.field.delete({
    where: { userId_code: { code, userId } },
  })
}

function withoutOwner(data: FieldData): FieldData {
  const { userId: _userId, user: _user, ...fields } = data
  return fields
}
