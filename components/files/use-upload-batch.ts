"use client"

import { useNotification } from "@/app/(app)/context"
import { uploadFilesAction } from "@/app/(app)/files/actions"
import { requestFileAnalysis } from "@/lib/analyze-client"
import { useRouter } from "next/navigation"
import { useRef, useState } from "react"

export type UploadPhase = "idle" | "uploading" | "analysing"

export function uploadPhaseLabel(phase: UploadPhase) {
  if (phase === "uploading") return "Uploading..."
  if (phase === "analysing") return "Analysing...won't be long"
  return ""
}

export function useUploadBatch() {
  const router = useRouter()
  const { showNotification } = useNotification()
  const [phase, setPhase] = useState<UploadPhase>("idle")
  const [error, setError] = useState("")
  const busy = useRef(false)

  const uploadBatch = async (files: FileList | File[]) => {
    const list = Array.from(files)
    if (!list.length || busy.current) return
    busy.current = true
    setError("")
    setPhase("uploading")
    const fileIds: string[] = []
    let uploadError = ""

    try {
      for (const file of list) {
        const formData = new FormData()
        formData.append("files", file)
        const result = await uploadFilesAction(formData)
        if (result.data?.fileIds?.length) fileIds.push(...result.data.fileIds)
        if (!result.success) {
          uploadError = result.error || "Something went wrong..."
          break
        }
      }

      if (fileIds.length > 0) {
        setPhase("analysing")
        await Promise.all(fileIds.map((fileId) => requestFileAnalysis(fileId)))
        showNotification({ code: "sidebar.unsorted", message: "new" })
        setTimeout(() => showNotification({ code: "sidebar.unsorted", message: "" }), 3000)
        router.push("/unsorted")
        router.refresh()
      }

      if (uploadError) {
        setError(uploadError)
        showNotification({ code: "global.banner", message: uploadError, type: "failed" })
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Something went wrong..."
      setError(message)
      showNotification({ code: "global.banner", message, type: "failed" })
    } finally {
      busy.current = false
      setPhase("idle")
    }
  }

  return { phase, error, clearError: () => setError(""), uploadBatch }
}
