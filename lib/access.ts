import { ADMIN_BRIDGE_COOKIE, LOGIN_COOKIE, LOGIN_SETTING, USER_VIEW_COOKIE } from "@/lib/access-cookies"
import { prisma } from "@/lib/db"
import { getSettings, updateSettings } from "@/models/settings"
import { getOrCreateSelfHostedUser, getSelfHostedUser, getUserById } from "@/models/users"
import { User } from "@/prisma/client"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { cache } from "react"

export { ADMIN_BRIDGE_COOKIE, LOGIN_COOKIE, LOGIN_SETTING, USER_VIEW_COOKIE } from "@/lib/access-cookies"

export type AppRole = "accounts" | "sales"

export type Actor = {
  user: User
  companyUser: User
  realRole: AppRole
  effectiveRole: AppRole
  loginRequired: boolean
  userView: boolean
}

function roleOf(user: User): AppRole {
  return user.role === "sales" ? "sales" : "accounts"
}

export const getCompanyUser = cache(async () => {
  const existing = await getSelfHostedUser()
  if (existing) return existing
  return await getOrCreateSelfHostedUser()
})

export const isLoginRequired = cache(async () => {
  const company = await getCompanyUser()
  const settings = await getSettings(company.id)
  return settings[LOGIN_SETTING] === "true"
})

export const resolveActor = cache(async (): Promise<Actor | null> => {
  const companyUser = await getCompanyUser()
  const loginRequired = await isLoginRequired()
  const cookieStore = await cookies()
  let user = companyUser

  if (loginRequired) {
    const { getSession } = await import("@/lib/auth")
    const session = await getSession()
    if (session?.user?.id) {
      const found = await getUserById(session.user.id)
      if (found) user = found
    } else if (cookieStore.get(ADMIN_BRIDGE_COOKIE)?.value === companyUser.id) {
      user = companyUser
    } else {
      return null
    }
  }

  const realRole = roleOf(user)
  const userView = realRole === "accounts" && cookieStore.get(USER_VIEW_COOKIE)?.value === "1"

  return {
    user,
    companyUser,
    realRole,
    effectiveRole: userView ? "sales" : realRole,
    loginRequired,
    userView,
  }
})

export async function getActor(): Promise<Actor> {
  const actor = await resolveActor()
  if (!actor) redirect("/enter")
  return actor
}

export async function requireAccounts() {
  const actor = await getActor()
  if (actor.effectiveRole !== "accounts") {
    return { ok: false as const, error: "Only accounts can do that" }
  }
  return { ok: true as const, actor }
}

export async function setLoginRequired(enabled: boolean) {
  const company = await getCompanyUser()
  await updateSettings(company.id, LOGIN_SETTING, enabled ? "true" : "false")
  const cookieStore = await cookies()
  cookieStore.set(LOGIN_COOKIE, enabled ? "1" : "0", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
  })
  if (enabled) {
    cookieStore.set(ADMIN_BRIDGE_COOKIE, company.id, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 180,
    })
  } else {
    cookieStore.delete(ADMIN_BRIDGE_COOKIE)
  }
}

export async function listMembers() {
  return await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true, name: true, role: true },
  })
}
