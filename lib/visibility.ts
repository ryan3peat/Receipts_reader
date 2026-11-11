import { Prisma } from "@/prisma/client"

export async function submitterId(): Promise<string | undefined> {
  const { getActor } = await import("@/lib/access")
  const actor = await getActor()
  if (actor.effectiveRole === "sales") return actor.user.id
  return undefined
}

export async function scopeTransactionWhere(where: Prisma.TransactionWhereInput) {
  const id = await submitterId()
  if (id) where.submittedById = id
  return where
}

export async function scopeFileWhere(where: Prisma.FileWhereInput) {
  const id = await submitterId()
  if (id) where.submittedById = id
  return where
}
