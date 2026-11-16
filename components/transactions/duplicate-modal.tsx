import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react"
import { format } from "date-fns"
import { ActionState } from "@/lib/actions"
import { Transaction } from "@/prisma/client"
import { useEffect, useState } from "react"

interface DuplicateModalProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  duplicateData: ActionState<Transaction>["duplicateData"] | null
  onKeepBoth: () => void
  onKeepOlder: (deleteOther: boolean) => void
  onKeepNewer: (deleteOther: boolean) => void
  onCancel: () => void
}

export function DuplicateModal({
  isOpen,
  onOpenChange,
  duplicateData,
  onKeepBoth,
  onKeepOlder,
  onKeepNewer,
  onCancel,
}: DuplicateModalProps) {
  const [choice, setChoice] = useState<"older" | "newer" | null>(null)

  useEffect(() => {
    if (!isOpen) setChoice(null)
  }, [isOpen])

  if (!duplicateData) return null

  // Safely extract the new data for readability
  const newData = duplicateData.newTransactionData as Transaction
  const existingData = duplicateData.existingTransaction

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        onOpenChange(open)
        if (!open) onCancel()
      }}
    >
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <AlertTriangle className="text-yellow-500 h-6 w-6" />
            Duplicate Transaction Detected
          </DialogTitle>
          <DialogDescription className="text-base">
            We found an existing transaction in your database that matches the date, amount, and merchant of this new
            entry. What would you like to do?
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 my-4">
          {/* LEFT CARD: Existing Data */}
          <Card className="border-yellow-200 bg-yellow-50/30 dark:border-yellow-900/50 dark:bg-yellow-900/10">
            <CardHeader className="pb-3 border-b border-yellow-100 dark:border-yellow-900/30 mb-3">
              <CardTitle className="text-sm font-medium text-yellow-800 dark:text-yellow-500 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" />
                Already in Database
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between border-b pb-1">
                <span className="text-muted-foreground">Date</span>
                <span className="font-medium">
                  {existingData.issuedAt ? format(new Date(existingData.issuedAt), "MMM dd, yyyy") : "N/A"}
                </span>
              </div>
              <div className="flex justify-between border-b pb-1">
                <span className="text-muted-foreground">Merchant</span>
                <span className="font-medium truncate ml-4 text-right">{existingData.merchant || "Unknown"}</span>
              </div>
              <div className="flex justify-between border-b pb-1">
                <span className="text-muted-foreground">Amount</span>
                <span className="font-bold text-base">
                  {(Number(existingData.total || 0) / 100).toFixed(2)} {existingData.currencyCode}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Type</span>
                <span className="capitalize">{existingData.type}</span>
              </div>
            </CardContent>
          </Card>

          {/* RIGHT CARD: New Data */}
          <Card className="border-blue-200 bg-blue-50/30 dark:border-blue-900/50 dark:bg-blue-900/10">
            <CardHeader className="pb-3 border-b border-blue-100 dark:border-blue-900/30 mb-3">
              <CardTitle className="text-sm font-medium text-blue-800 dark:text-blue-400 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                New Entry
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between border-b pb-1">
                <span className="text-muted-foreground">Date</span>
                <span className="font-medium">
                  {newData.issuedAt ? format(new Date(newData.issuedAt as unknown as string), "MMM dd, yyyy") : "N/A"}
                </span>
              </div>
              <div className="flex justify-between border-b pb-1">
                <span className="text-muted-foreground">Merchant</span>
                <span className="font-medium truncate ml-4 text-right">
                  {(newData.merchant as string) || "Unknown"}
                </span>
              </div>
              <div className="flex justify-between border-b pb-1">
                <span className="text-muted-foreground">Amount</span>
                <span className="font-bold text-base">
                  {(Number(newData.total || 0) / 100).toFixed(2)} {(newData.currencyCode as string) || ""}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Type</span>
                <span className="capitalize">{(newData.type as string) || "N/A"}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {choice ? (
          <div className="mt-6 flex flex-col gap-3 border-t pt-4">
            <p className="text-sm font-medium">Would you like to delete the other one?</p>
            <div className="flex gap-2">
              <Button
                type="button"
                onClick={() => (choice === "older" ? onKeepOlder(true) : onKeepNewer(true))}
              >
                Yes
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => (choice === "older" ? onKeepOlder(false) : onKeepNewer(false))}
              >
                No
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-6 pt-4 border-t">
            <Button
              variant="outline"
              onClick={() => setChoice("older")}
              className="w-full border-red-200 hover:bg-red-50 hover:text-red-600 dark:border-red-900/50 dark:hover:bg-red-900/20"
            >
              <XCircle className="h-4 w-4 mr-2" />
              Keep Older
            </Button>

            <Button
              onClick={onKeepBoth}
              className="w-full bg-green-600 hover:bg-green-700 text-white dark:bg-green-700 dark:hover:bg-green-800"
            >
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Keep Both
            </Button>

            <Button
              variant="outline"
              onClick={() => setChoice("newer")}
              className="w-full border-blue-200 hover:bg-blue-50 hover:text-blue-600 dark:border-blue-900/50 dark:hover:bg-blue-900/20"
            >
              <AlertTriangle className="h-4 w-4 mr-2" />
              Keep Newer
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
