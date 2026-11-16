"use client"

import { AnotherReceiptPrompt } from "@/components/files/another-receipt-prompt"
import { MAX_RECEIPTS_PER_UPLOAD, uploadPhaseLabel, useUploadBatch } from "@/components/files/use-upload-batch"
import { cn } from "@/lib/utils"
import { Camera, Files, List, Loader2 } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useRef, useState } from "react"

export function MobileShortcuts() {
  const pathname = usePathname()
  const cameraRef = useRef<HTMLInputElement>(null)
  const libraryRef = useRef<HTMLInputElement>(null)
  const [chooser, setChooser] = useState(false)
  const { phase, progress, error, notice, holdingAnalysis, heldCount, uploadBatch, finishUploadSession, clearError } =
    useUploadBatch()
  const isUploading = phase === "uploading"

  useEffect(() => {
    if (!chooser) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setChooser(false)
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [chooser])

  useEffect(() => {
    setChooser(false)
  }, [pathname])

  const onFiles = (files: FileList | null, holdAnalysis: boolean) => {
    if (!files?.length) return
    setChooser(false)
    void uploadBatch(files, { holdAnalysis })
  }

  const itemClass = (active: boolean) =>
    cn(
      "flex flex-col items-center justify-center gap-1 py-2 text-xs font-medium",
      active ? "text-primary" : "text-muted-foreground"
    )

  return (
    <nav aria-label="Shortcuts" className="fixed inset-x-0 bottom-0 z-50 border-t bg-background pb-[env(safe-area-inset-bottom)] md:hidden">
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(event) => {
          onFiles(event.target.files, true)
          event.target.value = ""
        }}
      />
      <input
        ref={libraryRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(event) => {
          onFiles(event.target.files, false)
          event.target.value = ""
        }}
      />
      {chooser && !holdingAnalysis && (
        <button
          type="button"
          aria-label="Close upload options"
          className="fixed inset-0 z-40 cursor-default bg-black/20"
          onClick={() => setChooser(false)}
        />
      )}
      <div className="absolute bottom-full left-3 z-50 mb-2 flex flex-col gap-2">
        {holdingAnalysis && (
          <AnotherReceiptPrompt
            atLimit={heldCount >= MAX_RECEIPTS_PER_UPLOAD}
            onAnother={() => cameraRef.current?.click()}
            onDone={finishUploadSession}
          />
        )}
        {chooser && !holdingAnalysis && (
          <div className="w-48 overflow-hidden rounded-lg border bg-background shadow-lg">
            <button
              type="button"
              className="block w-full px-3 py-3 text-left text-sm"
              onClick={() => {
                setChooser(false)
                cameraRef.current?.click()
              }}
            >
              Take photo
            </button>
            <button
              type="button"
              className="block w-full border-t px-3 py-3 text-left text-sm"
              onClick={() => {
                setChooser(false)
                libraryRef.current?.click()
              }}
            >
              Choose from phone
            </button>
          </div>
        )}
      </div>
      {phase !== "idle" && (
        <div className="flex items-center justify-center gap-2 border-b px-3 py-2 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          {uploadPhaseLabel(phase, progress)}
        </div>
      )}
      {error && (
        <button type="button" className="w-full border-b px-3 py-2 text-center text-xs text-red-600" onClick={clearError}>
          {error}
        </button>
      )}
      {notice && !error && <p className="border-b px-3 py-2 text-center text-xs text-muted-foreground">{notice}</p>}
      <div className="grid grid-cols-3">
        <button
          type="button"
          className={itemClass(chooser)}
          disabled={isUploading || holdingAnalysis}
          aria-expanded={chooser}
          onClick={() => setChooser((open) => !open)}
        >
          <Camera className="h-5 w-5" />
          {isUploading ? "Uploading" : "Upload"}
        </button>
        <Link href="/transactions" className={itemClass(pathname.startsWith("/transactions"))}>
          <List className="h-5 w-5" />
          Transactions
        </Link>
        <Link href="/unsorted" className={itemClass(pathname.startsWith("/unsorted"))}>
          <Files className="h-5 w-5" />
          Unsorted
        </Link>
      </div>
    </nav>
  )
}
