import { LOGIN_SETTING, USER_VIEW_COOKIE } from "@/lib/access-cookies"
import config from "@/lib/config"
import { prisma } from "@/lib/db"
import { isMasterAdminEmail } from "@/lib/master-admin"
import { getSettings } from "@/models/settings"
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
  isMaster: boolean
}

function roleOf(user: User): AppRole {
  // The Master Admin can never be locked out by a role stored in the database.
  if (isMasterAdminEmail(user.email)) return "accounts"
  return user.role === "sales" ? "sales" : "accounts"
}

export const getCompanyUser = cache(async () => {
  const existing = await getSelfHostedUser()
  if (existing) return existing
  return await getOrCreateSelfHostedUser()
})

export const isLoginRequired = cache(async () => {
  // Once Microsoft sign-in is set up there is no switch: sign-in is always required. It must not hang on the
  // saved setting alone, because restoring an older backup replaces that setting and would open the app to anyone.
  if (config.auth.microsoft) return true

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
    // A session is the only way in. Nothing else, and no session without a matching person, may fall back to
    // the default account, which has full access.
    const found = session?.user?.id ? await getUserById(session.user.id) : null
    if (!found) return null
    user = found
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
    // The default account counts as well: it is everyone while sign-in is not set up, and nobody afterwards.
    isMaster: user.id === companyUser.id || isMasterAdminEmail(user.email),
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

export async function requireMasterAdmin() {
  const gate = await requireAccounts()
  if (!gate.ok) return gate
  if (!gate.actor.isMaster) {
    return { ok: false as const, error: "Only the Master Admin can do that" }
  }
  return gate
}

export async function listMembers() {
  return await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true, name: true, role: true },
  })
}
