import { type Level } from "@/lib/reconciliation"
import { cn } from "@/lib/utils"

export const LEVEL_BG: Record<Level, string> = {
  red: "bg-red-500",
  orange: "bg-orange-400",
  green: "bg-green-500",
}

export const LEVEL_TEXT: Record<Level, string> = {
  red: "text-red-600",
  orange: "text-orange-600",
  green: "text-green-700",
}

export const LEVEL_NAME: Record<Level, string> = {
  red: "Red",
  orange: "Orange",
  green: "Green",
}

export function LevelDot({ level, className }: { level: Level; className?: string }) {
  return <span role="img" aria-label={LEVEL_NAME[level]} className={cn("inline-block size-2.5 shrink-0 rounded-full", LEVEL_BG[level], className)} />
}

export function CompletionBar({ percent, level }: { percent: number; level: Level }) {
  return (
    <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
      <div className={cn("h-full", LEVEL_BG[level])} style={{ width: `${percent}%` }} />
    </div>
  )
}
