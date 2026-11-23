import { randomUUID } from "crypto"
import { hashPassword } from "better-auth/crypto"
import config from "@/lib/config"
import { prisma } from "@/lib/db"
import { getOrCreateSelfHostedUser, SELF_HOSTED_USER } from "@/models/users"

// Temporary password for the company account while the Microsoft redirect URI is not registered.
export async function ensureDevLogin() {
  if (!config.auth.devLogin) return null
  const company = await getOrCreateSelfHostedUser()
  const email = config.auth.devLogin.email
  let loginEmail = company.email

  const canRename = company.email === SELF_HOSTED_USER.email || company.email.endsWith("@localhost")
  if (canRename && company.email !== email) {
    const taken = await prisma.user.findUnique({ where: { email } })
    if (!taken || taken.id === company.id) {
      await prisma.user.update({
        where: { id: company.id },
        data: { email, emailVerified: true, role: "accounts" },
      })
      loginEmail = email
    }
  } else if (company.email === email) {
    loginEmail = email
    await prisma.user.update({
      where: { id: company.id },
      data: { emailVerified: true, role: "accounts" },
    })
  }

  const password = await hashPassword(config.auth.devLogin.password)
  const existing = await prisma.account.findFirst({
    where: { userId: company.id, providerId: "credential" },
  })
  if (existing) {
    await prisma.account.update({
      where: { id: existing.id },
      data: { password, accountId: company.id },
    })
  } else {
    await prisma.account.create({
      data: {
        id: randomUUID(),
        accountId: company.id,
        providerId: "credential",
        userId: company.id,
        password,
      },
    })
  }

  return loginEmail
}
