import { prisma } from "@/lib/db"

/**
 * After statement rematch, set non-exported receipts to Matched or To Review from statement links.
 * Exported rows are left alone. Caller passes the receipt ids that rematch may have touched.
 */
export async function syncTransactionStatusesFromMatches(userId: string, transactionIds: string[]) {
  const ids = [...new Set(transactionIds.filter(Boolean))]
  if (ids.length === 0) return { matched: 0, toReview: 0 }

  const linked = await prisma.cardStatementLine.findMany({
    where: {
      transactionId: { in: ids },
      statement: { userId },
    },
    select: { transactionId: true },
  })
  const matchedIds = new Set(
    linked.flatMap((line) => (line.transactionId ? [line.transactionId] : []))
  )

  const eligible = await prisma.transaction.findMany({
    where: { userId, id: { in: ids }, status: { not: "exported" } },
    select: { id: true },
  })

  const toMatched = eligible.filter((tx) => matchedIds.has(tx.id)).map((tx) => tx.id)
  const toReview = eligible.filter((tx) => !matchedIds.has(tx.id)).map((tx) => tx.id)

  if (toMatched.length > 0) {
    await prisma.transaction.updateMany({
      where: { userId, id: { in: toMatched }, status: { not: "exported" } },
      data: { status: "matched" },
    })
  }
  if (toReview.length > 0) {
    await prisma.transaction.updateMany({
      where: { userId, id: { in: toReview }, status: { not: "exported" } },
      data: { status: "new" },
    })
  }

  return { matched: toMatched.length, toReview: toReview.length }
}

/** Remap every non-exported receipt for a company from current statement links (and clear legacy reviewed). */
export async function syncAllNonExportedTransactionStatuses(userId: string) {
  const txs = await prisma.transaction.findMany({
    where: { userId, status: { not: "exported" } },
    select: { id: true },
  })
  return syncTransactionStatusesFromMatches(
    userId,
    txs.map((tx) => tx.id)
  )
}
