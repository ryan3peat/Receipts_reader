"use server"

import { requireAccounts } from "@/lib/access"
import { prisma } from "@/lib/db"
import { getUserByEmail } from "@/models/users"
import { revalidatePath } from "next/cache"

export async function addMemberAction(_prev: { success: boolean; error?: string } | null, formData: FormData) {
  const gate = await requireAccounts()
  if (!gate.ok) return { success: false, error: gate.error }

  const email = String(formData.get("email") || "")
    .trim()
    .toLowerCase()
  const name = String(formData.get("name") || "").trim()
  const role = formData.get("role") === "accounts" ? "accounts" : "sales"

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
  const gate = await requireAccounts()
  if (!gate.ok) return { success: false, error: gate.error }

  if (userId === gate.actor.companyUser.id && role !== "accounts") {
    return { success: false, error: "The default account stays an admin" }
  }

  if (role === "sales") {
    const remaining = await prisma.user.count({ where: { role: "accounts", NOT: { id: userId } } })
    if (remaining < 1) return { success: false, error: "Keep at least one accounts user" }
  }

  await prisma.user.update({ where: { id: userId }, data: { role } })
  revalidatePath("/settings/users")
  return { success: true }
}
