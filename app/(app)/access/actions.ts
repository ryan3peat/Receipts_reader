"use server"

import { getActor, requireMasterAdmin, setLoginRequired } from "@/lib/access"
import { USER_VIEW_COOKIE } from "@/lib/access-cookies"
import { getMasterAdminEmail, isValidMasterAdminEmail } from "@/lib/master-admin"
import { ensureMasterAdminUser } from "@/models/users"
import { revalidatePath } from "next/cache"
import { cookies } from "next/headers"

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  secure: process.env.NODE_ENV === "production",
}

export async function setLoginRequiredAction(enabled: boolean) {
  const gate = await requireMasterAdmin()
  if (!gate.ok) return { success: false as const, error: gate.error }
  if (enabled) {
    // Without a Master Admin nobody could sign in afterwards to add people or change roles.
    const masterEmail = getMasterAdminEmail()
    if (!masterEmail) {
      return { success: false as const, error: "Set MASTER_ADMIN_EMAIL before turning Login on" }
    }
    if (!isValidMasterAdminEmail(masterEmail)) {
      return { success: false as const, error: "MASTER_ADMIN_EMAIL is not a valid email address" }
    }
    await ensureMasterAdminUser(masterEmail)
  }
  await setLoginRequired(enabled)
  revalidatePath("/", "layout")
  return { success: true as const }
}

export async function setUserViewAction(enabled: boolean) {
  const actor = await getActor()
  if (actor.realRole !== "accounts") {
    return { success: false as const, error: "Only accounts can use User View" }
  }
  const cookieStore = await cookies()
  if (enabled) {
    cookieStore.set(USER_VIEW_COOKIE, "1", cookieOptions)
  } else {
    cookieStore.delete(USER_VIEW_COOKIE)
  }
  revalidatePath("/", "layout")
  return { success: true as const }
}
