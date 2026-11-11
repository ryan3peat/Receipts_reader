"use client"

import { uploadPhaseLabel, useUploadBatch } from "@/components/files/use-upload-batch"
import { cn } from "@/lib/utils"
import { Camera, Files, List, Loader2 } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useRef, useState } from "react"

export function MobileShortcuts() {
  const pathname = usePathname()
  const cameraRef = useRef<HTMLInputElement>(null)
  const libraryRef = useRef<HTMLInputElement>(null)
  const [chooser, setChooser] = useState(false)
  const { phase, uploadBatch } = useUploadBatch()
  const isBusy = phase !== "idle"

  const onFiles = (files: FileList | null) => {
    if (!files?.length) return
    void uploadBatch(files)
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
          onFiles(event.target.files)
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
          onFiles(event.target.files)
          event.target.value = ""
        }}
      />
      {chooser && !isBusy && (
        <div className="absolute bottom-full left-3 mb-2 w-48 overflow-hidden rounded-lg border bg-background shadow-lg">
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
      {isBusy && (
        <div className="flex items-center justify-center gap-2 border-b px-3 py-2 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          {uploadPhaseLabel(phase)}
        </div>
      )}
      <div className="grid grid-cols-3">
        <button
          type="button"
          className={itemClass(false)}
          disabled={isBusy}
          onClick={() => setChooser((open) => !open)}
        >
          <Camera className="h-5 w-5" />
          {isBusy ? (phase === "uploading" ? "Uploading" : "Analysing") : "Upload"}
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
