"use client"

import { AnotherReceiptPrompt } from "@/components/files/another-receipt-prompt"
import { MAX_RECEIPTS_PER_UPLOAD, uploadPhaseLabel, useUploadBatch } from "@/components/files/use-upload-batch"
import { FormError } from "@/components/forms/error"
import { Button } from "@/components/ui/button"
import config from "@/lib/config"
import { Camera, Loader2, Upload } from "lucide-react"
import { DragEvent, useRef } from "react"

export default function DashboardDropZoneWidget() {
  const cameraRef = useRef<HTMLInputElement>(null)
  const uploadRef = useRef<HTMLInputElement>(null)
  const { phase, progress, error, notice, holdingAnalysis, heldCount, uploadBatch, finishUploadSession } =
    useUploadBatch()
  const isUploading = phase === "uploading"

  const handleFileChange = (holdAnalysis: boolean) => (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      void uploadBatch(e.target.files, { holdAnalysis })
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
        onChange={handleFileChange(true)}
      />
      <input
        ref={uploadRef}
        type="file"
        className="hidden"
        multiple
        accept={config.upload.acceptedMimeTypes}
        onChange={handleFileChange(false)}
      />
      <div className="flex flex-col items-center justify-center gap-4 p-8 text-center h-full w-full">
        {isUploading || phase === "analysing" ? (
          <Loader2 className="h-8 w-8 text-muted-foreground animate-spin" />
        ) : (
          <Camera className="h-8 w-8 text-muted-foreground" />
        )}
        <div>
          <p className="text-lg font-medium">
            {phase === "idle" ? (holdingAnalysis ? "Photo uploaded" : "Take a photo or drop your files here") : uploadPhaseLabel(phase, progress)}
          </p>
          {!error && (
            <p className="text-sm text-muted-foreground">upload receipts, invoices and any other documents for me to scan</p>
          )}
          {notice && <p className="text-sm text-muted-foreground">{notice}</p>}
          {error && <FormError>{error}</FormError>}
        </div>
        {holdingAnalysis ? (
          <AnotherReceiptPrompt
            atLimit={heldCount >= MAX_RECEIPTS_PER_UPLOAD}
            onAnother={() => cameraRef.current?.click()}
            onDone={finishUploadSession}
          />
        ) : (
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
        )}
      </div>
    </div>
  )
}
