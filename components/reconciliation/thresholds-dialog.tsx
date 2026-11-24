"use client"

import { saveThresholdsAction } from "@/app/(app)/sap/queue-actions"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { DEFAULT_THRESHOLDS, validateThresholds, type Thresholds } from "@/lib/reconciliation"
import { SlidersHorizontal } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { LevelDot } from "./status"

export function ThresholdsDialog({
  thresholds,
  onSaved,
}: {
  thresholds: Thresholds
  onSaved: (thresholds: Thresholds) => void
}) {
  const [open, setOpen] = useState(false)
  const [red, setRed] = useState(String(thresholds.redBelow))
  const [green, setGreen] = useState(String(thresholds.greenAbove))
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  function onOpenChange(next: boolean) {
    setOpen(next)
    if (next) {
      setRed(String(thresholds.redBelow))
      setGreen(String(thresholds.greenAbove))
      setError(null)
    }
  }

  async function save() {
    if (red.trim() === "" || green.trim() === "") return setError("Enter both thresholds")
    const problem = validateThresholds(Number(red), Number(green))
    if (problem) return setError(problem)
    setSaving(true)
    const result = await saveThresholdsAction(Number(red), Number(green))
    setSaving(false)
    if (!result.success) return setError(result.error)
    onSaved(result.thresholds)
    setOpen(false)
    toast.success("Thresholds saved")
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <SlidersHorizontal />
          Thresholds
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Colour thresholds</DialogTitle>
          <DialogDescription>
            The share of purchases with a receipt attached decides each statement&apos;s colour. A statement can only be exported
            for SAP once it is green.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <label className="flex items-center gap-3 text-sm">
            <LevelDot level="red" />
            <span className="flex-1">Red when under</span>
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              max={100}
              step={1}
              value={red}
              onChange={(event) => setRed(event.target.value)}
              className="w-20"
              aria-label="Red below percent"
            />
            <span className="text-muted-foreground">%</span>
          </label>
          <label className="flex items-center gap-3 text-sm">
            <LevelDot level="green" />
            <span className="flex-1">Green when over</span>
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              max={100}
              step={1}
              value={green}
              onChange={(event) => setGreen(event.target.value)}
              className="w-20"
              aria-label="Green above percent"
            />
            <span className="text-muted-foreground">%</span>
          </label>
          <p className="flex items-center gap-3 text-sm text-muted-foreground">
            <LevelDot level="orange" />
            Orange is everything in between. Set green to 100 to require every receipt.
          </p>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            variant="ghost"
            onClick={() => {
              setRed(String(DEFAULT_THRESHOLDS.redBelow))
              setGreen(String(DEFAULT_THRESHOLDS.greenAbove))
              setError(null)
            }}
            disabled={saving}
          >
            Reset to 50 / 90
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
