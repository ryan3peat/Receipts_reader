"use server"

import { prisma } from "@/lib/db"
import { scopeFileWhere } from "@/lib/visibility"
import { unlink } from "fs/promises"
import { safePathJoin, FILE_UPLOAD_PATH } from "@/lib/files"
import path from "path"
import { cache } from "react"
import { getTransactionById } from "./transactions"

export const getUnsortedFiles = cache(async (userId: string) => {
  const where = { isReviewed: false, userId }
  await scopeFileWhere(where)
  return await prisma.file.findMany({
    where,
    orderBy: {
      createdAt: "desc",
    },
  })
})

export const getUnsortedFilesCount = cache(async (userId: string) => {
  const where = { isReviewed: false, userId }
  await scopeFileWhere(where)
  return await prisma.file.count({ where })
})

export const getFileById = cache(async (id: string, userId: string) => {
  const where = { id, userId }
  await scopeFileWhere(where)
  return await prisma.file.findFirst({ where })
})

export const getFilesByTransactionId = cache(async (id: string, userId: string) => {
  const transaction = await getTransactionById(id, userId)
  if (transaction && transaction.files) {
    return await prisma.file.findMany({
      where: {
        id: {
          in: transaction.files as string[],
        },
        userId,
      },
      orderBy: {
        createdAt: "asc",
      },
    })
  }
  return []
})

export const createFile = async (userId: string, data: any) => {
  const { getActor } = await import("@/lib/access")
  const actor = await getActor()
  return await prisma.file.create({
    data: {
      ...data,
      userId,
      submittedById: actor.user.id,
    },
  })
}

export const updateFile = async (id: string, userId: string, data: any) => {
  const existing = await getFileById(id, userId)
  if (!existing) {
    throw new Error("File not found")
  }
  return await prisma.file.update({
    where: { id },
    data,
  })
}

export const deleteFile = async (id: string, userId: string) => {
  const file = await getFileById(id, userId)
  if (!file) {
    return
  }

  // Security: ensure the resolved path stays within the upload directory
  const uploadPath = process.env.UPLOAD_PATH || "./data/uploads"
  const resolvedUploadPath = path.resolve(uploadPath)
  const resolvedFilePath = path.resolve(resolvedUploadPath, file.path)

  if (!resolvedFilePath.startsWith(resolvedUploadPath + path.sep)) {
    console.error("Security: attempted path traversal in file delete", { filePath: file.path, resolvedFilePath })
    return
  }

  try {
    // Use safePathJoin to prevent path traversal attacks (issue #75).
    // file.path is relative to the user's uploads directory.
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } })
    const userUploadsDir = safePathJoin(FILE_UPLOAD_PATH, user.email)
    const fullPath = safePathJoin(userUploadsDir, file.path)
    await unlink(fullPath)
  } catch (error) {
    console.error("Error deleting file:", error)
  }

  return await prisma.file.delete({
    where: { id, userId },
  })
}
