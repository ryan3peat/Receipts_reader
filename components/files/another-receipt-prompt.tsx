"use client"

import { Button } from "@/components/ui/button"

export function AnotherReceiptPrompt({
  atLimit,
  onAnother,
  onDone,
}: {
  atLimit: boolean
  onAnother: () => void
  onDone: () => void
}) {
  return (
    <div className="w-64 rounded-lg border bg-background p-3 shadow-lg">
      <p className="text-sm font-medium">{atLimit ? "10 receipt limit reached" : "Take another receipt photo?"}</p>
      <div className="mt-3 flex gap-2">
        <Button type="button" size="sm" disabled={atLimit} onClick={onAnother}>
          Take another
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onDone}>
          Done
        </Button>
      </div>
    </div>
  )
}
