import { prisma } from "@/lib/db"
import { Prisma } from "@/prisma/client"
import { cache } from "react"

export const getCurrencies = cache(async (userId: string) => {
  return await prisma.currency.findMany({
    where: { userId },
    orderBy: {
      code: "asc",
    },
  })
})

export const createCurrency = async (userId: string, currency: Prisma.CurrencyCreateInput) => {
  const { userId: _userId, user: _user, ...fields } = currency
  return await prisma.currency.create({
    data: {
      ...fields,
      user: {
        connect: {
          id: userId,
        },
      },
    },
  })
}

export const updateCurrency = async (userId: string, code: string, currency: Prisma.CurrencyUpdateInput) => {
  const { userId: _userId, user: _user, ...fields } = currency
  return await prisma.currency.update({
    where: { userId_code: { code, userId } },
    data: fields,
  })
}

export const deleteCurrency = async (userId: string, code: string) => {
  return await prisma.currency.delete({
    where: { userId_code: { code, userId } },
  })
}
