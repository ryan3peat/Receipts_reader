"use client"

import { uploadPhaseLabel, useUploadBatch } from "@/components/files/use-upload-batch"
import { Button } from "@/components/ui/button"
import config from "@/lib/config"
import { Loader2 } from "lucide-react"
import { ComponentProps, useRef } from "react"
import { FormError } from "../forms/error"

export function UploadButton({ children, ...props }: { children: React.ReactNode } & ComponentProps<typeof Button>) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { phase, error, uploadBatch } = useUploadBatch()
  const isBusy = phase !== "idle"

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      await uploadBatch(e.target.files)
    }
    e.target.value = ""
  }

  const handleButtonClick = (e: React.MouseEvent) => {
    e.preventDefault() // Prevent any form submission
    fileInputRef.current?.click()
  }

  return (
    <div>
      <input
        ref={fileInputRef}
        type="file"
        id="fileInput"
        className="hidden"
        multiple
        accept={config.upload.acceptedMimeTypes}
        onChange={handleFileChange}
      />

      <Button onClick={handleButtonClick} disabled={isBusy} type="button" {...props}>
        {isBusy ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {uploadPhaseLabel(phase)}
          </>
        ) : (
          <>{children}</>
        )}
      </Button>

      {error && <FormError>{error}</FormError>}
    </div>
  )
}
