"use server"

import { requireMasterAdmin } from "@/lib/access"
import { prisma } from "@/lib/db"
import { isMasterAdminEmail } from "@/lib/master-admin"
import { getUserByEmail, getUserById } from "@/models/users"
import { revalidatePath } from "next/cache"

export async function addMemberAction(_prev: { success: boolean; error?: string } | null, formData: FormData) {
  const gate = await requireMasterAdmin()
  if (!gate.ok) return { success: false, error: gate.error }

  const email = String(formData.get("email") || "")
    .trim()
    .toLowerCase()
  const name = String(formData.get("name") || "").trim()
  const role = formData.get("role") === "accounts" || isMasterAdminEmail(email) ? "accounts" : "sales"

  if (!email.includes("@") || email.endsWith("@localhost")) {
    return { success: false, error: "Enter a real email address" }
  }

  const existing = await getUserByEmail(email)
  if (existing) return { success: false, error: "That email already has an account" }

  await prisma.user.create({
    data: {
      email,
      name: name || email,
      role,
      membershipPlan: "unlimited",
      emailVerified: true,
    },
  })

  revalidatePath("/settings/users")
  return { success: true }
}

export async function updateMemberRoleAction(userId: string, role: "accounts" | "sales") {
  const gate = await requireMasterAdmin()
  if (!gate.ok) return { success: false, error: gate.error }

  if (userId === gate.actor.companyUser.id && role !== "accounts") {
    return { success: false, error: "The default account stays an admin" }
  }

  const target = await getUserById(userId)
  if (!target) return { success: false, error: "Not found" }
  if (isMasterAdminEmail(target.email) && role !== "accounts") {
    return { success: false, error: "The Master Admin stays an admin" }
  }

  if (role === "sales") {
    const remaining = await prisma.user.count({ where: { role: "accounts", NOT: { id: userId } } })
    if (remaining < 1) return { success: false, error: "Keep at least one accounts user" }
  }

  await prisma.user.update({ where: { id: userId }, data: { role } })
  revalidatePath("/settings/users")
  return { success: true }
}
