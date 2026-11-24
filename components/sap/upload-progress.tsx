"use client"

import { estimateRemaining, formatElapsed, formatRemaining } from "@/lib/statement-state"
import { Check, Circle, LoaderCircle } from "lucide-react"
import { useEffect, useState } from "react"

// A page that has been waiting this long gets a note, so a slow page is not mistaken for a stalled upload.
const SLOW_PAGE_MS = 45_000

export type Progress =
  | { stage: "uploading"; runStart: number; stageStart: number }
  | {
      stage: "reading"
      runStart: number
      stageStart: number
      uploadMs: number
      pageCount: number
      // The page being worked on, how many are finished, how many of those were blank.
      page: number
      done: number
      blank: number
      attempt: number
      attempts: number
      pageStart: number
      // How long each page that went to the model took, for the time left.
      modelMs: number[]
      lastError?: string
    }
  | {
      stage: "saving"
      runStart: number
      stageStart: number
      uploadMs: number
      readMs: number
      pageCount: number
      blank: number
      done: number
      total: number
      current: string
    }

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [active])
  return now
}

type Row = { label: string; detail?: string; state: "waiting" | "active" | "done"; time?: string }

function Icon({ state }: { state: Row["state"] }) {
  if (state === "done") return <Check className="size-4 text-green-600" aria-hidden />
  if (state === "active") return <LoaderCircle className="size-4 animate-spin text-primary" aria-hidden />
  return <Circle className="size-4 text-muted-foreground/50" aria-hidden />
}

export function UploadProgress({ progress }: { progress: Progress }) {
  const now = useNow(true)
  const elapsed = (since: number) => formatElapsed(now - since)

  const rows: Row[] = []
  let percent = 0
  let note: string | null = null
  let warn: string | null = null

  if (progress.stage === "uploading") {
    rows.push({ label: "Uploading the statement", detail: "Sending the PDF to the server", state: "active", time: elapsed(progress.stageStart) })
    rows.push({ label: "Reading the pages", state: "waiting" })
    rows.push({ label: "Creating the statements", state: "waiting" })
  } else if (progress.stage === "reading") {
    const pageMs = now - progress.pageStart
    const remaining = estimateRemaining(progress.modelMs, progress.pageCount - progress.done - 1)
    const read = progress.done - progress.blank
    rows.push({ label: `Uploaded, ${progress.pageCount} page${progress.pageCount === 1 ? "" : "s"} found`, state: "done", time: formatElapsed(progress.uploadMs) })
    rows.push({
      label: `Reading page ${progress.page} of ${progress.pageCount}`,
      detail: `Breaking the page out of the PDF, then reading it. ${read} read${progress.blank > 0 ? `, ${progress.blank} blank skipped` : ""}.`,
      state: "active",
      time: elapsed(progress.stageStart),
    })
    rows.push({ label: "Creating the statements", state: "waiting" })
    percent = (progress.done / progress.pageCount) * 100
    note = remaining === null ? null : `${formatRemaining(remaining)} left for the pages`
    if (progress.attempt > 1) {
      warn = `Page ${progress.page} failed (${progress.lastError ?? "no answer"}). Trying again, attempt ${progress.attempt} of ${progress.attempts}.`
    } else if (pageMs > SLOW_PAGE_MS) {
      warn = `Page ${progress.page} has taken ${formatElapsed(pageMs)}, longer than usual. It is still working. If the model does not answer in time the page is tried again automatically.`
    }
  } else {
    const read = progress.pageCount - progress.blank
    rows.push({ label: `Uploaded, ${progress.pageCount} page${progress.pageCount === 1 ? "" : "s"} found`, state: "done", time: formatElapsed(progress.uploadMs) })
    rows.push({
      label: `Read ${read} page${read === 1 ? "" : "s"}${progress.blank > 0 ? `, ${progress.blank} blank skipped` : ""}`,
      state: "done",
      time: formatElapsed(progress.readMs),
    })
    rows.push({
      label: `Creating statement ${Math.min(progress.done + 1, progress.total)} of ${progress.total}`,
      detail: progress.current,
      state: "active",
      time: elapsed(progress.stageStart),
    })
    percent = (progress.done / progress.total) * 100
  }

  return (
    <div className="space-y-3 rounded-md border p-4 text-sm" role="status" aria-live="polite">
      <ol className="space-y-2">
        {rows.map((row) => (
          <li key={row.label} className="flex items-start gap-2">
            <span className="mt-0.5">
              <Icon state={row.state} />
            </span>
            <div className="min-w-0 flex-1">
              <p className={row.state === "waiting" ? "text-muted-foreground" : "font-medium"}>{row.label}</p>
              {row.detail && <p className="text-xs text-muted-foreground">{row.detail}</p>}
            </div>
            {row.time && <span className="tabular-nums text-xs text-muted-foreground">{row.time}</span>}
          </li>
        ))}
      </ol>

      {progress.stage !== "uploading" && (
        <div className="space-y-1">
          <div
            className="h-2 w-full overflow-hidden rounded bg-muted"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(percent)}
          >
            <div className="h-2 bg-primary transition-all" style={{ width: `${percent}%` }} />
          </div>
          {note && <p className="text-xs text-muted-foreground">{note}</p>}
        </div>
      )}

      {warn && <p className="rounded border border-yellow-200 bg-yellow-50 p-2 text-xs text-yellow-950">{warn}</p>}

      <p className="text-xs text-muted-foreground">Total time {elapsed(progress.runStart)}. Keep this page open until it finishes.</p>
    </div>
  )
}
