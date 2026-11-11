"use client"

import { uploadPhaseLabel, useUploadBatch } from "@/components/files/use-upload-batch"
import { FormError } from "@/components/forms/error"
import { Button } from "@/components/ui/button"
import config from "@/lib/config"
import { Camera, Loader2, Upload } from "lucide-react"
import { DragEvent, useRef } from "react"

export default function DashboardDropZoneWidget() {
  const cameraRef = useRef<HTMLInputElement>(null)
  const uploadRef = useRef<HTMLInputElement>(null)
  const { phase, error, uploadBatch } = useUploadBatch()
  const isBusy = phase !== "idle"

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      void uploadBatch(e.target.files)
    }
    e.target.value = ""
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    if (event.dataTransfer.files.length > 0) {
      void uploadBatch(event.dataTransfer.files)
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
        {isBusy ? (
          <Loader2 className="h-8 w-8 text-muted-foreground animate-spin" />
        ) : (
          <Camera className="h-8 w-8 text-muted-foreground" />
        )}
        <div>
          <p className="text-lg font-medium">{isBusy ? uploadPhaseLabel(phase) : "Take a photo or drop your files here"}</p>
          {!error && (
            <p className="text-sm text-muted-foreground">upload receipts, invoices and any other documents for me to scan</p>
          )}
          {error && <FormError>{error}</FormError>}
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button type="button" disabled={isBusy} onClick={() => cameraRef.current?.click()}>
            <Camera className="h-4 w-4" />
            Take photo
          </Button>
          <Button type="button" variant="outline" disabled={isBusy} onClick={() => uploadRef.current?.click()}>
            <Upload className="h-4 w-4" />
            Upload
          </Button>
        </div>
      </div>
    </div>
  )
}
