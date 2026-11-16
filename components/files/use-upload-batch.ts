"use client"

import { useNotification } from "@/app/(app)/context"
import { uploadFilesAction } from "@/app/(app)/files/actions"
import { requestFileAnalysis } from "@/lib/analyze-client"
import {
  limitReceiptFiles,
  MAX_RECEIPTS_PER_UPLOAD,
  uploadPhaseLabel,
  type UploadPhase,
  type UploadProgress,
} from "@/lib/upload-progress"
import { useRouter } from "next/navigation"
import { useCallback, useRef, useState } from "react"

export type { UploadPhase, UploadProgress }
export { MAX_RECEIPTS_PER_UPLOAD, uploadPhaseLabel }

type UploadJob = {
  file: File
  done: () => void
}

const EMPTY_PROGRESS: UploadProgress = { current: 0, total: 0 }

export function useUploadBatch() {
  const router = useRouter()
  const { showNotification } = useNotification()
  const [phase, setPhase] = useState<UploadPhase>("idle")
  const [progress, setProgress] = useState<UploadProgress>(EMPTY_PROGRESS)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [holdingAnalysis, setHoldingAnalysis] = useState(false)
  const [heldCount, setHeldCount] = useState(0)

  const queue = useRef<UploadJob[]>([])
  const pumping = useRef(false)
  const uploadedCount = useRef(0)
  const pendingIds = useRef<string[]>([])
  const holdAnalysis = useRef(false)
  const heldCountRef = useRef(0)
  const analysisToken = useRef(0)

  const syncHeld = (count: number) => {
    heldCountRef.current = count
    setHeldCount(count)
  }

  const startAnalysis = (fileIds: string[]) => {
    if (fileIds.length === 0) {
      setPhase("idle")
      return
    }
    const token = ++analysisToken.current
    setPhase("analysing")
    showNotification({ code: "sidebar.unsorted", message: "new" })
    setTimeout(() => showNotification({ code: "sidebar.unsorted", message: "" }), 3000)
    router.push("/unsorted")
    router.refresh()
    void Promise.all(fileIds.map((fileId) => requestFileAnalysis(fileId))).finally(() => {
        if (analysisToken.current === token) {
          setPhase((current) => (current === "analysing" ? "idle" : current))
        }
      })
  }

  const pump = async (): Promise<void> => {
    if (pumping.current) return
    pumping.current = true
    setPhase("uploading")
    let uploadError = ""

    try {
      while (queue.current.length > 0) {
        const job = queue.current.shift()!
        uploadedCount.current += 1
        setProgress({
          current: uploadedCount.current,
          total: uploadedCount.current + queue.current.length,
        })
        try {
          const formData = new FormData()
          formData.append("files", job.file)
          const result = await uploadFilesAction(formData)
          if (result.data?.fileIds?.length) pendingIds.current.push(...result.data.fileIds)
          if (!result.success) {
            uploadError = result.error || "Something went wrong..."
            const rest = queue.current.splice(0)
            rest.forEach((item) => item.done())
            break
          }
        } catch (caught) {
          const message = caught instanceof Error ? caught.message : ""
          uploadError = /failed to fetch/i.test(message)
            ? "The upload didn't reach the server. The connection dropped."
            : message || "Something went wrong..."
          const rest = queue.current.splice(0)
          rest.forEach((item) => item.done())
          break
        } finally {
          job.done()
        }
      }
    } finally {
      pumping.current = false
      if (queue.current.length > 0) {
        void pump()
        return
      }
      uploadedCount.current = 0
      setProgress(EMPTY_PROGRESS)
      if (uploadError) {
        setError(uploadError)
        showNotification({ code: "global.banner", message: uploadError, type: "failed" })
      }
      if (!holdAnalysis.current) {
        const ids = pendingIds.current.splice(0)
        startAnalysis(ids)
      } else {
        setPhase("idle")
      }
    }
  }

  const uploadBatch = (files: FileList | File[], options?: { holdAnalysis?: boolean }) => {
    const incoming = Array.from(files)
    if (!incoming.length) return Promise.resolve()

    const sessionHold = options?.holdAnalysis || holdAnalysis.current
    const { accepted, dropped } = limitReceiptFiles(incoming, sessionHold ? heldCountRef.current : 0)
    if (dropped > 0) {
      setNotice(`Up to ${MAX_RECEIPTS_PER_UPLOAD} receipts at a time.`)
    } else {
      setNotice("")
    }
    if (!accepted.length) return Promise.resolve()

    setError("")
    if (options?.holdAnalysis) {
      holdAnalysis.current = true
      setHoldingAnalysis(true)
    }
    if (sessionHold) syncHeld(heldCountRef.current + accepted.length)

    let remaining = accepted.length
    let resolveBatch: () => void = () => {}
    const batchDone = new Promise<void>((resolve) => {
      resolveBatch = resolve
    })
    for (const file of accepted) {
      queue.current.push({
        file,
        done: () => {
          remaining -= 1
          if (remaining === 0) resolveBatch()
        },
      })
    }

    const total = uploadedCount.current + queue.current.length
    setProgress({ current: pumping.current ? uploadedCount.current : 1, total })
    setPhase("uploading")
    void pump()
    return batchDone
  }

  const finishUploadSession = () => {
    holdAnalysis.current = false
    setHoldingAnalysis(false)
    setNotice("")
    syncHeld(0)
    if (pumping.current) return
    const ids = pendingIds.current.splice(0)
    startAnalysis(ids)
  }

  const clearError = useCallback(() => setError(""), [])

  return {
    phase,
    progress,
    error,
    notice,
    holdingAnalysis,
    heldCount,
    clearError,
    uploadBatch,
    finishUploadSession,
  }
}
