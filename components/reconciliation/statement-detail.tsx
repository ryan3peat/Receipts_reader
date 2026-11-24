"use client"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  completionPercent,
  groupLevel,
  levelFor,
  monthLabel,
  neededForGreen,
  type Group,
  type Thresholds,
} from "@/lib/reconciliation"
import { cn, formatCurrency } from "@/lib/utils"
import type { GroupDetail } from "@/models/reconciliation"
import { useState } from "react"
import { CompletionBar, LEVEL_TEXT, LevelDot } from "./status"

export type DetailState = GroupDetail | "error" | undefined

function cardEnding(card: string) {
  const digits = card.replace(/\D/g, "")
  return digits ? `\u2022\u2022${digits.slice(-4)}` : ""
}

function day(value: string | null) {
  if (!value) return "No date"
  return new Date(`${value}T00:00:00Z`).toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  })
}

export function StatementDetail({
  group,
  thresholds,
  detail,
  onRetry,
}: {
  group: Group
  thresholds: Thresholds
  detail: DetailState
  onRetry: () => void
}) {
  const [choice, setChoice] = useState<"missing" | "all" | null>(null)

  // Once the lines are matched the counts come from them, so the colour is never older than the table below.
  const ready = detail && detail !== "error" ? detail : null
  const purchases = ready ? ready.purchases : group.purchases
  const missing = ready ? ready.missing : group.missing
  const level = levelFor(purchases, missing, thresholds)
  const percent = completionPercent(purchases, missing)
  const needed = neededForGreen(purchases, missing, thresholds)
  const filter = choice ?? (missing > 0 ? "missing" : "all")
  const lines = ready ? (filter === "missing" ? ready.lines.filter((line) => !line.hasReceipt) : ready.lines) : []
  const multiple = group.statementIds.length > 1

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <LevelDot level={groupLevel({ purchases, missing }, thresholds)} className="mt-1.5 size-3" />
        <div>
          <h3 className="text-lg font-semibold leading-tight">{group.employeeName}</h3>
          <p className="text-sm text-muted-foreground">
            {[monthLabel(group.month), ...group.cards.map(cardEnding).filter(Boolean).map((card) => `card ${card}`)].join(", ")}
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap gap-x-8 gap-y-2">
          <div>
            <div className={cn("text-2xl font-semibold", LEVEL_TEXT[level])}>{percent}%</div>
            <div className="text-xs text-muted-foreground">receipts attached</div>
          </div>
          <div>
            <div className="text-2xl font-semibold">
              {missing}/{purchases}
            </div>
            <div className="text-xs text-muted-foreground">missing receipts</div>
          </div>
        </div>
        <CompletionBar percent={percent} level={level} />
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          {group.statementIds.map((id, index) =>
            level === "green" ? (
              <Button key={id} asChild>
                {/* A plain link: the route builds the workbook, so it must not be prefetched. */}
                <a href={`/sap/${id}`}>{multiple ? `Export for SAP, ${cardEnding(group.cards[index]) || `statement ${index + 1}`}` : "Export for SAP"}</a>
              </Button>
            ) : (
              <Button key={id} disabled>
                {multiple ? `Export for SAP, ${cardEnding(group.cards[index]) || `statement ${index + 1}`}` : "Export for SAP"}
              </Button>
            )
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {level === "green"
            ? missing === 0
              ? "All receipts are attached."
              : `Ready to export. ${missing} unmatched purchase${missing === 1 ? "" : "s"} will be highlighted in the sheet.`
            : thresholds.greenAbove >= 100
              ? `Export is locked: all ${missing} missing receipt${missing === 1 ? "" : "s"} are needed.`
              : `Export is locked: ${needed} more receipt${needed === 1 ? "" : "s"} needed to get over ${thresholds.greenAbove}%.`}
        </p>
      </div>

      <div className="space-y-2">
        <div className="flex gap-1">
          <Button size="sm" variant={filter === "missing" ? "secondary" : "ghost"} onClick={() => setChoice("missing")}>
            Missing ({missing})
          </Button>
          <Button size="sm" variant={filter === "all" ? "secondary" : "ghost"} onClick={() => setChoice("all")}>
            All ({purchases})
          </Button>
        </div>

        {detail === undefined ? (
          <div className="space-y-2" aria-busy="true">
            {Array.from({ length: 5 }, (_, index) => (
              <Skeleton key={index} className="h-9 w-full" />
            ))}
          </div>
        ) : detail === "error" ? (
          <div className="flex items-center gap-3 rounded-md border border-destructive/40 p-3 text-sm">
            <span className="flex-1">The transactions could not be loaded.</span>
            <Button size="sm" variant="outline" onClick={onRetry}>
              Try again
            </Button>
          </div>
        ) : lines.length === 0 ? (
          <p className="rounded-md border p-3 text-sm text-muted-foreground">No missing receipts on this statement.</p>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Merchant</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Receipt</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((line) => (
                  <TableRow key={line.id} className={line.hasReceipt ? undefined : "bg-red-50"}>
                    <TableCell className="whitespace-nowrap">{day(line.postedOn)}</TableCell>
                    <TableCell>{line.narrative}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">{formatCurrency(line.amountCents, "AUD")}</TableCell>
                    <TableCell>
                      {line.hasReceipt ? (
                        <span className="text-muted-foreground">Attached</span>
                      ) : (
                        <span className="font-medium text-red-600">Missing</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  )
}
