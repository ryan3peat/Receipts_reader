export const MAX_RECEIPTS_PER_UPLOAD = 10

export type UploadPhase = "idle" | "uploading" | "analysing"

export type UploadProgress = {
  current: number
  total: number
}

export function limitReceiptFiles<T>(files: T[], alreadyHeld = 0, max = MAX_RECEIPTS_PER_UPLOAD) {
  const room = Math.max(0, max - alreadyHeld)
  const accepted = files.slice(0, room)
  return { accepted, dropped: files.length - accepted.length }
}

export function uploadPhaseLabel(phase: UploadPhase, progress?: UploadProgress) {
  if (phase === "uploading") {
    if (progress && progress.total > 1) return `Uploading ${progress.current}/${progress.total}`
    return "Uploading..."
  }
  if (phase === "analysing") return "Analysing...won't be long"
  return ""
}
