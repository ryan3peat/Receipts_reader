"use client"

import { useNotification } from "@/app/(app)/context"
import { uploadFilesAction } from "@/app/(app)/files/actions"
import { cn } from "@/lib/utils"
import { Camera, Files, List } from "lucide-react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { startTransition, useRef, useState } from "react"

export function MobileShortcuts() {
  const pathname = usePathname()
  const router = useRouter()
  const { showNotification } = useNotification()
  const cameraRef = useRef<HTMLInputElement>(null)
  const [isUploading, setIsUploading] = useState(false)

  const uploadPhoto = (files: FileList | null) => {
    if (!files?.length || isUploading) return
    setIsUploading(true)
    const formData = new FormData()
    for (const file of Array.from(files)) {
      formData.append("files", file)
    }

    startTransition(async () => {
      const result = await uploadFilesAction(formData)
      if (result.success) {
        showNotification({ code: "sidebar.unsorted", message: "new" })
        setTimeout(() => showNotification({ code: "sidebar.unsorted", message: "" }), 3000)
        router.push("/unsorted")
      }
      setIsUploading(false)
    })
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
          uploadPhoto(event.target.files)
          event.target.value = ""
        }}
      />
      <div className="grid grid-cols-3">
        <button type="button" className={itemClass(false)} disabled={isUploading} onClick={() => cameraRef.current?.click()}>
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
