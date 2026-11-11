"use client"

import { useNotification } from "@/app/(app)/context"
import { uploadFilesAction } from "@/app/(app)/files/actions"
import { FormError } from "@/components/forms/error"
import { Button } from "@/components/ui/button"
import config from "@/lib/config"
import { Camera, Loader2, Upload } from "lucide-react"
import { useRouter } from "next/navigation"
import { DragEvent, startTransition, useRef, useState } from "react"

export default function DashboardDropZoneWidget() {
  const router = useRouter()
  const { showNotification } = useNotification()
  const cameraRef = useRef<HTMLInputElement>(null)
  const uploadRef = useRef<HTMLInputElement>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState("")

  const uploadFiles = (files: FileList | File[]) => {
    if (!files.length || isUploading) return
    setIsUploading(true)
    setUploadError("")
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
      } else {
        setUploadError(result.error ? result.error : "Something went wrong...")
      }
      setIsUploading(false)
    })
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      uploadFiles(e.target.files)
    }
    e.target.value = ""
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    if (event.dataTransfer.files.length > 0) {
      uploadFiles(event.dataTransfer.files)
    }
  }

  return (
    <div
      className="relative flex w-full h-full border-2 border-dashed rounded-lg transition-colors hover:border-primary"
      onDragOver={(event) => event.preventDefault()}
      onDrop={handleDrop}
    >
      <input
        ref={cameraRef}
        type="file"
        className="hidden"
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
      />
      <input
        ref={uploadRef}
        type="file"
        className="hidden"
        multiple
        accept={config.upload.acceptedMimeTypes}
        onChange={handleFileChange}
      />
      <div className="flex flex-col items-center justify-center gap-4 p-8 text-center h-full w-full">
        {isUploading ? (
          <Loader2 className="h-8 w-8 text-muted-foreground animate-spin" />
        ) : (
          <Camera className="h-8 w-8 text-muted-foreground" />
        )}
        <div>
          <p className="text-lg font-medium">{isUploading ? "Uploading..." : "Take a photo or drop your files here"}</p>
          {!uploadError && (
            <p className="text-sm text-muted-foreground">upload receipts, invoices and any other documents for me to scan</p>
          )}
          {uploadError && <FormError>{uploadError}</FormError>}
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button type="button" disabled={isUploading} onClick={() => cameraRef.current?.click()}>
            <Camera className="h-4 w-4" />
            Take photo
          </Button>
          <Button type="button" variant="outline" disabled={isUploading} onClick={() => uploadRef.current?.click()}>
            <Upload className="h-4 w-4" />
            Upload
          </Button>
        </div>
      </div>
    </div>
  )
}
