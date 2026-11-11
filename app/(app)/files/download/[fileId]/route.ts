import { getCurrentUser } from "@/lib/auth"
import { readStoredFile } from "@/lib/file-bytes"
import { encodeFilename } from "@/lib/utils"
import { getFileById } from "@/models/files"
import { NextResponse } from "next/server"

export async function GET(request: Request, { params }: { params: Promise<{ fileId: string }> }) {
  const { fileId } = await params
  const user = await getCurrentUser()

  if (!fileId) {
    return new NextResponse("No fileId provided", { status: 400 })
  }

  try {
    // Find file in database
    const file = await getFileById(fileId, user.id)

    if (!file || file.userId !== user.id) {
      return new NextResponse("File not found or does not belong to the user", { status: 404 })
    }

    const fileBuffer = await readStoredFile(user, file)
    if (!fileBuffer) {
      return new NextResponse("File not found", { status: 404 })
    }

    // Return file with proper content type and encoded filename
    return new NextResponse(fileBuffer, {
      headers: {
        "Content-Type": file.mimetype,
          "Content-Disposition": `attachment; filename*=${encodeFilename(file.filename)}`,
        },
    })
  } catch (error) {
    console.error("Error serving file:", error)
    return new NextResponse("Internal Server Error", { status: 500 })
  }
}
