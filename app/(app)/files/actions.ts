"use server"

import { ActionState } from "@/lib/actions"
import { getCurrentUser, isSubscriptionExpired } from "@/lib/auth"
import { getDirectorySize, getUserUploadsDirectory, isEnoughStorageToUploadFile } from "@/lib/files"
import { ingestUnsortedFile } from "@/lib/uploads"
import { updateUser } from "@/models/users"
import { revalidatePath } from "next/cache"

export async function uploadFilesAction(formData: FormData): Promise<ActionState<{ fileIds: string[] }>> {
  const user = await getCurrentUser()
  const files = formData.getAll("files") as File[]

  // Check limits
  const totalFileSize = files.reduce((acc, file) => acc + file.size, 0)
  if (!isEnoughStorageToUploadFile(user, totalFileSize)) {
    return { success: false, error: `Insufficient storage to upload these files` }
  }

  if (isSubscriptionExpired(user)) {
    return {
      success: false,
      error: "Your subscription has expired, please upgrade your account or buy new subscription plan",
    }
  }

  const fileIds: string[] = []
  try {
    for (const file of files) {
      if (!(file instanceof File)) continue
      const arrayBuffer = await file.arrayBuffer()
      const saved = await ingestUnsortedFile(user, {
        buffer: Buffer.from(arrayBuffer),
        filename: file.name,
        mimetype: file.type,
        metadata: { lastModified: file.lastModified },
      })
      fileIds.push(saved.id)
    }
  } catch (error) {
    console.error("Upload error:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Upload failed",
      data: { fileIds },
    }
  }

  if (fileIds.length === 0) {
    return { success: false, error: "No files to upload" }
  }

  let storageUsed = (user.storageUsed || 0) + totalFileSize
  try {
    storageUsed = await getDirectorySize(getUserUploadsDirectory(user))
  } catch {
    // Hosted uploads have no disk folder. The bytes are stored on the file row.
  }
  await updateUser(user.id, { storageUsed })

  revalidatePath("/unsorted")

  return { success: true, data: { fileIds } }
}
