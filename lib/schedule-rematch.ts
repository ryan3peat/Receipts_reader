import { prisma } from "@/lib/db"
import { rematchStatementsForEmployee } from "@/models/statements"
import { after } from "next/server"

async function employeeIdsFromFiles(userId: string, fileIds: string[]) {
  if (fileIds.length === 0) return [] as string[]
  const files = await prisma.file.findMany({
    where: { userId, id: { in: fileIds } },
    select: { submittedById: true },
  })
  return files.flatMap((file) => (file.submittedById ? [file.submittedById] : []))
}

/**
 * After a receipt is saved, rematch that cardholder's statements in the background.
 * Uses transaction owner and any file uploaders so Accounts review still finds the right reconciliations.
 */
export function scheduleRematchForTransaction(
  userId: string,
  opts: { submittedById?: string | null; fileIds?: string[] | null }
) {
  after(async () => {
    try {
      const fromFiles = Array.isArray(opts.fileIds)
        ? await employeeIdsFromFiles(userId, opts.fileIds.filter(Boolean))
        : []
      const ids = [...new Set([opts.submittedById, ...fromFiles].filter((id): id is string => Boolean(id)))]
      for (const employeeId of ids) {
        await rematchStatementsForEmployee(userId, employeeId)
      }
    } catch (error) {
      console.error("Background statement rematch failed", { userId, error })
    }
  })
}
