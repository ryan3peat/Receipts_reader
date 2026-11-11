import { File, Transaction, User } from "@/prisma/client"
import { formatDate } from "date-fns"
import { access, constants, mkdir, readdir, stat, writeFile } from "fs/promises"
import os from "os"
import path from "path"
import config from "./config"

export const FILE_UPLOAD_PATH = path.resolve(/*turbopackIgnore: true*/ process.env.UPLOAD_PATH || "./uploads")
export const FILE_UNSORTED_DIRECTORY_NAME = "unsorted"
export const FILE_PREVIEWS_DIRECTORY_NAME = "previews"
export const FILE_STATIC_DIRECTORY_NAME = "static"
export const FILE_IMPORT_CSV_DIRECTORY_NAME = "csv"

export function getUserUploadsDirectory(user: User) {
  return safePathJoin(FILE_UPLOAD_PATH, user.email)
}

export function getStaticDirectory(user: User) {
  return safePathJoin(getUserUploadsDirectory(user), FILE_STATIC_DIRECTORY_NAME)
}

export function getUserPreviewsDirectory(user: User) {
  return safePathJoin(getUserUploadsDirectory(user), FILE_PREVIEWS_DIRECTORY_NAME)
}

export function unsortedFilePath(fileUuid: string, filename: string) {
  const fileExtension = path.extname(filename)
  return safePathJoin(FILE_UNSORTED_DIRECTORY_NAME, `${fileUuid}${fileExtension}`)
}

export function previewFilePath(fileUuid: string, page: number, extension = "webp") {
  return safePathJoin(FILE_PREVIEWS_DIRECTORY_NAME, `${fileUuid}.${page}.${extension}`)
}

export function getTransactionFileUploadPath(fileUuid: string, filename: string, transaction: Transaction) {
  const fileExtension = path.extname(filename)
  const storedFileName = `${fileUuid}${fileExtension}`
  return formatFilePath(storedFileName, transaction.issuedAt || new Date())
}

export function fullPathForFile(user: User, file: File) {
  const userUploadsDirectory = getUserUploadsDirectory(user)
  return safePathJoin(userUploadsDirectory, file.path)
}

export function getTransactionExportRelativeFolder(transaction: Transaction, totalFiles: number): string {
  return path.posix.join(
    transaction.issuedAt ? formatDate(transaction.issuedAt, "yyyy/MM") : "",
    totalFiles > 1 ? transaction.name || transaction.id : ""
  )
}

export function getTransactionExportFileName(transaction: Transaction, file: File): string {
  const ext = path.extname(file.path)
  const shortId = file.id.replace(/-/g, "").slice(0, 5)
  const baseName = `${formatDate(transaction.issuedAt || new Date(), "yyyy-MM-dd")} - ${transaction.name || transaction.id}`
  return `${baseName} ${shortId}${ext}`
}

export function getTransactionExportFilePath(transaction: Transaction, file: File, totalFiles: number): string {
  return path.posix.join(
    "files",
    getTransactionExportRelativeFolder(transaction, totalFiles),
    getTransactionExportFileName(transaction, file)
  )
}

function formatFilePath(filename: string, date: Date, format = "{YYYY}/{MM}/{name}{ext}") {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const ext = path.extname(filename)
  const name = path.basename(filename, ext)

  return format.replace("{YYYY}", String(year)).replace("{MM}", month).replace("{name}", name).replace("{ext}", ext)
}

export function safePathJoin(basePath: string, ...paths: string[]) {
  const joinedPath = path.join(basePath, path.normalize(path.join(...paths)))
  if (!joinedPath.startsWith(basePath)) {
    throw new Error("Path traversal detected")
  }
  return joinedPath
}

export async function fileExists(filePath: string) {
  try {
    await access(path.normalize(filePath), constants.F_OK)
    return true
  } catch {
    return false
  }
}

function isReadOnlyFs(error: unknown) {
  const code = (error as NodeJS.ErrnoException).code
  return code === "ENOENT" || code === "EACCES" || code === "EPERM" || code === "EROFS"
}

export async function writeBytesIfPossible(fullPath: string, buffer: Buffer) {
  try {
    await mkdir(path.dirname(fullPath), { recursive: true })
    await writeFile(fullPath, buffer)
  } catch (error) {
    if (isReadOnlyFs(error)) return
    throw error
  }
}

export async function ensureWritableDir(preferred: string) {
  try {
    await mkdir(preferred, { recursive: true })
    return preferred
  } catch (error) {
    if (!isReadOnlyFs(error)) throw error
    const fallback = path.join(os.tmpdir(), "ef-previews")
    await mkdir(fallback, { recursive: true })
    return fallback
  }
}

export async function getDirectorySize(directoryPath: string) {
  let totalSize = 0
  async function calculateSize(dir: string) {
    const files = await readdir(dir, { withFileTypes: true })
    for (const file of files) {
      const fullPath = path.join(dir, file.name)
      if (file.isDirectory()) {
        await calculateSize(fullPath)
      } else if (file.isFile()) {
        const stats = await stat(fullPath)
        totalSize += stats.size
      }
    }
  }
  await calculateSize(directoryPath)
  return totalSize
}

export function isEnoughStorageToUploadFile(user: User, fileSize: number) {
  if (config.selfHosted.isEnabled || user.storageLimit < 0) {
    return true
  }
  return user.storageUsed + fileSize <= user.storageLimit
}
