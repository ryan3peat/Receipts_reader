import { prisma } from "@/lib/db"
import { Prisma } from "@/prisma/client"
import { cache } from "react"
import { isDatabaseEmpty } from "./defaults"
import { createUserDefaults } from "./defaults"

export const SELF_HOSTED_USER = {
  email: "taxhacker@localhost",
  name: "EF Expenses",
  membershipPlan: "unlimited",
}

// The default account owns all company data, so it must still be found even if its email is ever changed.
// It is always the earliest user: nobody else can be added until it exists.
async function findDefaultAccount() {
  const byEmail = await prisma.user.findFirst({
    where: { email: SELF_HOSTED_USER.email },
  })
  if (byEmail) return { user: byEmail, renamed: false }

  const earliest = await prisma.user.findFirst({
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  })
  return { user: earliest, renamed: earliest !== null }
}

export const getSelfHostedUser = cache(async () => {
  if (!process.env.DATABASE_URL) {
    return null // fix for CI, do not remove
  }

  return (await findDefaultAccount()).user
})

export const getOrCreateSelfHostedUser = cache(async () => {
  // Never create a second, empty default account next to one whose email was changed.
  const existing = await findDefaultAccount()
  if (existing.user && existing.renamed) return existing.user

  return await prisma.user.upsert({
    where: { email: SELF_HOSTED_USER.email },
    update: SELF_HOSTED_USER,
    create: SELF_HOSTED_USER,
  })
})

export async function getOrCreateCloudUser(email: string, data: Prisma.UserCreateInput) {
  const user = await prisma.user.upsert({
    where: { email: email.toLowerCase() },
    update: data,
    create: data,
  })

  if (await isDatabaseEmpty(user.id)) {
    await createUserDefaults(user.id)
  }

  return user
}

export const getUserById = cache(async (id: string) => {
  return await prisma.user.findUnique({
    where: { id },
  })
})

export const getUserByEmail = cache(async (email: string) => {
  return await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  })
})

export const getUserByStripeCustomerId = cache(async (customerId: string) => {
  return await prisma.user.findFirst({
    where: { stripeCustomerId: customerId },
  })
})

// Called when Login is turned on, so the Master Admin can always sign in and manage everyone else.
export async function ensureMasterAdminUser(email: string) {
  return await prisma.user.upsert({
    where: { email },
    update: { role: "accounts" },
    create: { email, name: email, role: "accounts", membershipPlan: "unlimited", emailVerified: true },
  })
}

export function updateUser(userId: string, data: Prisma.UserUpdateInput) {
  return prisma.user.update({
    where: { id: userId },
    data,
  })
}
