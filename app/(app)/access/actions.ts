"use server"

import { getActor, requireAccounts, setLoginRequired } from "@/lib/access"
import { USER_VIEW_COOKIE } from "@/lib/access-cookies"
import { revalidatePath } from "next/cache"
import { cookies } from "next/headers"

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  secure: process.env.NODE_ENV === "production",
}

export async function setLoginRequiredAction(enabled: boolean) {
  const gate = await requireAccounts()
  if (!gate.ok) return { success: false as const, error: gate.error }
  if (enabled && gate.actor.companyUser.email.endsWith("@localhost")) {
    return {
      success: false as const,
      error: "Set a real email in Profile before turning login on",
    }
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
