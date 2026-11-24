import {
  checkStatement,
  matchCardholder,
  type Cardholder,
  type CombinedStatement,
  type HolderCheck,
  type ParsedCardSection,
} from "@/lib/sap"

// Progress of a statement upload, kept on the stored file so a finished page survives a reload.
// A page is either blank (skipped, no model call) or read (its entries are stored).
export type StatementState = {
  pageCount: number
  blank: number[]
  read: Record<string, unknown[]>
}

export function readState(value: unknown): StatementState | null {
  if (!value || typeof value !== "object") return null
  const stored = value as { pageCount?: unknown; blank?: unknown; read?: unknown }
  if (typeof stored.pageCount !== "number" || !Number.isInteger(stored.pageCount) || stored.pageCount < 1) return null
  const blank = Array.isArray(stored.blank) ? stored.blank.map((page) => Number(page)).filter(Number.isInteger) : []
  const read = stored.read && typeof stored.read === "object" && !Array.isArray(stored.read) ? (stored.read as Record<string, unknown[]>) : {}
  return { pageCount: stored.pageCount, blank, read }
}

export function pagesLeft(state: StatementState): number[] {
  const left: number[] = []
  for (let page = 1; page <= state.pageCount; page++) {
    if (!state.blank.includes(page) && !(String(page) in state.read)) left.push(page)
  }
  return left
}

// Every read entry, in page order.
export function readEntries(state: StatementState): unknown[] {
  const entries: unknown[] = []
  for (let page = 1; page <= state.pageCount; page++) entries.push(...(state.read[String(page)] ?? []))
  return entries
}

export type SaveTarget = { index: number; person: Cardholder; section: ParsedCardSection }

export type SavePlan = {
  targets: SaveTarget[]
  // Cards in the PDF that no person could be found for, so nothing is saved for them.
  unmatched: { accountName: string; accountNumber: string; lineCount: number }[]
  checks: HolderCheck[]
}

// Works out which cards get saved and for whom, before anything is written. The billing account has no owner.
export function planSave(combined: CombinedStatement, people: Cardholder[]): SavePlan {
  const targets: SaveTarget[] = []
  const unmatched: SavePlan["unmatched"] = []
  combined.sections.forEach((section, index) => {
    if (section.billing || section.lines.length === 0) return
    const person = matchCardholder(section, people)
    if (person) targets.push({ index, person, section })
    else unmatched.push({ accountName: section.accountName, accountNumber: section.accountNumber, lineCount: section.lines.length })
  })
  return { targets, unmatched, checks: checkStatement(combined) }
}

export function hasCardLines(combined: CombinedStatement): boolean {
  return combined.sections.some((section) => !section.billing && section.lines.length > 0)
}

// 65000 -> "1m 05s", 8000 -> "8s".
export function formatElapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  return `${minutes}m ${String(seconds % 60).padStart(2, "0")}s`
}

// A rough time left from how long the pages that needed the model took. Null until there are two to go on.
export function estimateRemaining(durationsMs: number[], pagesToGo: number): number | null {
  if (durationsMs.length < 2 || pagesToGo <= 0) return null
  const average = durationsMs.reduce((sum, value) => sum + value, 0) / durationsMs.length
  return average * pagesToGo
}

// "about 40s", "about 2 min".
export function formatRemaining(ms: number): string {
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `about ${Math.max(5, Math.round(seconds / 5) * 5)}s`
  return `about ${Math.round(seconds / 60)} min`
}
