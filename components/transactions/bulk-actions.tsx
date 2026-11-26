"use client"

import { bulkDeleteTransactionsAction, bulkSetTransactionStatusAction } from "@/app/(app)/transactions/actions"
import { Button } from "@/components/ui/button"
import type { ManualTransactionStatus } from "@/lib/transaction-status"
import { Trash2, Undo2 } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

interface BulkActionsMenuProps {
  selectedIds: string[]
  canSetStatus?: boolean
  onActionComplete?: () => void
}

export function BulkActionsMenu({ selectedIds, canSetStatus = false, onActionComplete }: BulkActionsMenuProps) {
  const [isLoading, setIsLoading] = useState(false)

  const handleDelete = async () => {
    const confirmMessage =
      "Are you sure you want to delete these transactions and all their files? This action cannot be undone."
    if (!confirm(confirmMessage)) return

    try {
      setIsLoading(true)
      const result = await bulkDeleteTransactionsAction(selectedIds)
      if (!result.success) {
        throw new Error(result.error)
      }
      onActionComplete?.()
    } catch (error) {
      console.error("Failed to delete transactions:", error)
      alert(`Failed to delete transactions: ${error}`)
    } finally {
      setIsLoading(false)
    }
  }

  const handleStatus = async (status: ManualTransactionStatus) => {
    try {
      setIsLoading(true)
      const result = await bulkSetTransactionStatusAction(selectedIds, status)
      if (!result.success) {
        throw new Error(result.error)
      }
      toast.success(
        result.skipped
          ? `Marked ${result.count} as To Review. ${result.skipped} already exported and left unchanged.`
          : `Marked ${result.count} as To Review.`
      )
      onActionComplete?.()
    } catch (error) {
      console.error("Failed to update status:", error)
      toast.error(`Failed to update status: ${error instanceof Error ? error.message : error}`)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="fixed bottom-20 right-4 z-50 flex flex-col items-stretch gap-2 md:bottom-4 md:flex-row">
      {canSetStatus && (
        <Button variant="outline" className="gap-2" disabled={isLoading} onClick={() => handleStatus("new")}>
          <Undo2 className="h-4 w-4" />
          Mark {selectedIds.length} To Review
        </Button>
      )}
      <Button variant="destructive" className="min-w-48 gap-2" disabled={isLoading} onClick={handleDelete}>
        <Trash2 className="h-4 w-4" />
        Delete {selectedIds.length} transactions
      </Button>
    </div>
  )
}
