"use server"

import { ensureWritableDir, fileExists, getUserPreviewsDirectory, safePathJoin } from "@/lib/files"
import { User } from "@/prisma/client"
import { readFile } from "fs/promises"
import * as mupdf from "mupdf"
import path from "path"
import sharp from "sharp"
import config from "../config"
import { DEFAULT_PREVIEW_FORMAT, PreviewFormat, previewContentType, previewExtension } from "./format"

// Renders a PDF with mupdf (wasm). pdf2pic needs GraphicsMagick, which is not on Vercel.
export async function pdfToImages(
  user: User,
  origFilePath: string,
  format: PreviewFormat = DEFAULT_PREVIEW_FORMAT
): Promise<{ contentType: string; pages: string[] }> {
  const userPreviewsDirectory = await ensureWritableDir(getUserPreviewsDirectory(user))

  const basename = path.basename(origFilePath, path.extname(origFilePath))
  const extension = previewExtension(format)
  const contentType = previewContentType(format)

  const existingPages: string[] = []
  for (let i = 1; i <= config.upload.pdfs.maxPages; i++) {
    const convertedFilePath = safePathJoin(userPreviewsDirectory, `${basename}.${i}.${extension}`)
    if (await fileExists(convertedFilePath)) {
      existingPages.push(convertedFilePath)
    } else {
      break
    }
  }

  if (existingPages.length > 0) {
    return { contentType, pages: existingPages }
  }

  const bytes = await readFile(origFilePath)
  const document = mupdf.Document.openDocument(new Uint8Array(bytes), "application/pdf") as mupdf.PDFDocument
  const paths: string[] = []
  try {
    const pageCount = Math.min(document.countPages(), config.upload.pdfs.maxPages)
    for (let index = 0; index < pageCount; index++) {
      const page = document.loadPage(index)
      try {
        const [x0, y0, x1, y1] = page.getBounds()
        const width = Math.max(x1 - x0, 1)
        const height = Math.max(y1 - y0, 1)
        const scale = Math.min(
          config.upload.pdfs.dpi / 72,
          config.upload.pdfs.maxWidth / width,
          config.upload.pdfs.maxHeight / height
        )
        const pixmap = page.toPixmap(mupdf.Matrix.scale(scale, scale), mupdf.ColorSpace.DeviceRGB, false, true)
        try {
          const outputPath = safePathJoin(userPreviewsDirectory, `${basename}.${index + 1}.${extension}`)
          const image = sharp(Buffer.from(pixmap.asPNG()))
          if (format === "png") await image.png().toFile(outputPath)
          else if (format === "jpeg") await image.jpeg({ quality: config.upload.pdfs.quality }).toFile(outputPath)
          else await image.webp({ quality: config.upload.pdfs.quality }).toFile(outputPath)
          paths.push(outputPath)
        } finally {
          pixmap.destroy()
        }
      } finally {
        page.destroy()
      }
    }
  } catch (error) {
    console.error("Error converting PDF to image:", error)
    throw error
  } finally {
    document.destroy()
  }

  return { contentType, pages: paths }
}
