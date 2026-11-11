import { fileExists, fullPathForFile } from "@/lib/files"
import { readFileBytes } from "@/models/files"
import { File, User } from "@/prisma/client"
import { mkdir, readFile, writeFile } from "fs/promises"
import os from "os"
import path from "path"

export async function readStoredFile(user: User, file: File): Promise<Buffer | null> {
  const stored = await readFileBytes(file.id)
  if (stored) return stored
  const diskPath = fullPathForFile(user, file)
  if (await fileExists(diskPath)) return readFile(diskPath)
  return null
}

export async function materializeFile(user: User, file: File): Promise<string | null> {
  const diskPath = fullPathForFile(user, file)
  if (await fileExists(diskPath)) return diskPath
  const stored = await readFileBytes(file.id)
  if (!stored) return null
  const directory = path.join(os.tmpdir(), "ef-files")
  await mkdir(directory, { recursive: true })
  const tmpPath = path.join(directory, `${file.id}${path.extname(file.filename || file.path)}`)
  await writeFile(tmpPath, stored)
  return tmpPath
}
