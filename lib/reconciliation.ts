// Pure logic for the Reconciliations page. Nothing here touches the database, so it is safe in client components.

export type Level = "red" | "orange" | "green"

export type Thresholds = {
  // Under this share of receipts attached is red.
  redBelow: number
  // Over this share is green. At 100 a statement is green only when no receipt is missing.
  greenAbove: number
}

export const DEFAULT_THRESHOLDS: Thresholds = { redBelow: 50, greenAbove: 90 }
export const RED_BELOW_SETTING = "recon_red_below"
export const GREEN_ABOVE_SETTING = "recon_green_above"

// The page loads this many of the latest months first. Older months arrive afterwards.
export const RECENT_MONTHS = 6

function whole(raw: string | undefined): number | null {
  if (raw === undefined || raw.trim() === "") return null
  const value = Number(raw)
  return Number.isInteger(value) && value >= 0 && value <= 100 ? value : null
}

export function validateThresholds(redBelow: number, greenAbove: number): string | null {
  const ok = (value: number) => Number.isInteger(value) && value >= 0 && value <= 100
  if (!ok(redBelow) || !ok(greenAbove)) return "Thresholds must be whole numbers from 0 to 100"
  if (redBelow > greenAbove) return "Red cannot be above the green threshold"
  return null
}

export function parseThresholds(settings: Record<string, string>): Thresholds {
  const redBelow = whole(settings[RED_BELOW_SETTING])
  const greenAbove = whole(settings[GREEN_ABOVE_SETTING])
  if (redBelow === null || greenAbove === null || validateThresholds(redBelow, greenAbove)) return DEFAULT_THRESHOLDS
  return { redBelow, greenAbove }
}

export function levelFor(purchases: number, missing: number, thresholds: Thresholds): Level {
  if (purchases === 0) return "green"
  const attached = purchases - missing
  if (attached * 100 < thresholds.redBelow * purchases) return "red"
  if (thresholds.greenAbove >= 100) return missing === 0 ? "green" : "orange"
  return attached * 100 > thresholds.greenAbove * purchases ? "green" : "orange"
}

// How many more receipts a statement needs before it turns green.
export function neededForGreen(purchases: number, missing: number, thresholds: Thresholds): number {
  if (levelFor(purchases, missing, thresholds) === "green") return 0
  if (thresholds.greenAbove >= 100) return missing
  const attached = purchases - missing
  const target = Math.min(purchases, Math.floor((thresholds.greenAbove * purchases) / 100) + 1)
  return Math.max(0, target - attached)
}

export function completionPercent(purchases: number, missing: number): number {
  if (purchases === 0) return 100
  return Math.round(((purchases - missing) / purchases) * 100)
}

/** "YYYY-MM" for a date, or null when there is none. Statement dates are stored at UTC midnight. */
export function monthOf(date: Date | null | undefined): string | null {
  if (!date || Number.isNaN(date.getTime())) return null
  return date.toISOString().slice(0, 7)
}

/** The first month of the recent window: `months` months ending at `latest`. */
export function windowStart(latest: string, months: number = RECENT_MONTHS): string {
  const year = Number(latest.slice(0, 4))
  const month = Number(latest.slice(5, 7)) - 1
  const index = year * 12 + month - (months - 1)
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]

export function monthName(month: string | null, style: "long" | "short" = "long"): string {
  if (!month) return "Unknown period"
  const name = MONTHS[Number(month.slice(5, 7)) - 1] ?? month
  return style === "short" ? name.slice(0, 3) : name
}

export function monthLabel(month: string | null): string {
  return month ? `${monthName(month)} ${month.slice(0, 4)}` : "Unknown period"
}

/** One card statement with its receipt counts. Counts come from the database, never from loading the lines. */
export type StatementSummary = {
  id: string
  employeeId: string
  employeeName: string
  accountNumber: string
  month: string | null
  purchases: number
  missing: number
}

/** A person's statements for one month. A lost card and its replacement make two statements in the same month. */
export type Group = {
  key: string
  employeeId: string
  employeeName: string
  month: string | null
  statementIds: string[]
  cards: string[]
  purchases: number
  missing: number
}

export function groupStatements(statements: StatementSummary[]): Group[] {
  const groups = new Map<string, Group>()
  for (const statement of statements) {
    const key = `${statement.employeeId}|${statement.month ?? "none"}`
    const group = groups.get(key) ?? {
      key,
      employeeId: statement.employeeId,
      employeeName: statement.employeeName,
      month: statement.month,
      statementIds: [],
      cards: [],
      purchases: 0,
      missing: 0,
    }
    group.statementIds.push(statement.id)
    group.cards.push(statement.accountNumber)
    group.purchases += statement.purchases
    group.missing += statement.missing
    groups.set(key, group)
  }
  return Array.from(groups.values())
}

export function groupLevel(group: Pick<Group, "purchases" | "missing">, thresholds: Thresholds): Level {
  return levelFor(group.purchases, group.missing, thresholds)
}

export type Rollup = {
  count: number
  purchases: number
  missing: number
  level: Level
  red: number
  orange: number
  green: number
}

export function rollup(groups: Group[], thresholds: Thresholds): Rollup {
  const purchases = groups.reduce((sum, group) => sum + group.purchases, 0)
  const missing = groups.reduce((sum, group) => sum + group.missing, 0)
  const counts = { red: 0, orange: 0, green: 0 }
  for (const group of groups) counts[groupLevel(group, thresholds)] += 1
  return { count: groups.length, purchases, missing, level: levelFor(purchases, missing, thresholds), ...counts }
}

/** Incomplete statements first, worst first. Complete ones are kept apart so the page can leave them folded. */
export function splitForQueue(groups: Group[], thresholds: Thresholds) {
  const incomplete: Group[] = []
  const complete: Group[] = []
  for (const group of groups) (groupLevel(group, thresholds) === "green" ? complete : incomplete).push(group)
  incomplete.sort(
    (left, right) =>
      completionPercent(left.purchases, left.missing) - completionPercent(right.purchases, right.missing) ||
      right.missing - left.missing ||
      left.employeeName.localeCompare(right.employeeName)
  )
  complete.sort((left, right) => left.employeeName.localeCompare(right.employeeName))
  return { incomplete, complete }
}

export type MonthNode = { month: string | null; groups: Group[] }
export type YearNode = { year: string; months: MonthNode[]; groups: Group[] }

/** Year > month tree, newest first. Statements with no dated purchase go last under "Undated". */
export function buildTree(groups: Group[]): YearNode[] {
  const byMonth = new Map<string, Group[]>()
  for (const group of groups) {
    const key = group.month ?? "none"
    byMonth.set(key, [...(byMonth.get(key) ?? []), group])
  }
  const years = new Map<string, MonthNode[]>()
  const dated = Array.from(byMonth.keys()).filter((key) => key !== "none").sort().reverse()
  for (const month of dated) {
    const year = month.slice(0, 4)
    years.set(year, [...(years.get(year) ?? []), { month, groups: byMonth.get(month) ?? [] }])
  }
  const tree: YearNode[] = Array.from(years.entries()).map(([year, months]) => ({
    year,
    months,
    groups: months.flatMap((node) => node.groups),
  }))
  const undated = byMonth.get("none")
  if (undated) tree.push({ year: "Undated", months: [{ month: null, groups: undated }], groups: undated })
  return tree
}

/** The statement to open first: the worst incomplete one in the newest month that has any, else the newest. */
export function pickDefault(groups: Group[], thresholds: Thresholds): Group | null {
  const months = Array.from(new Set(groups.map((group) => group.month).filter((month): month is string => month !== null)))
    .sort()
    .reverse()
  for (const month of months) {
    const { incomplete } = splitForQueue(
      groups.filter((group) => group.month === month),
      thresholds
    )
    if (incomplete[0]) return incomplete[0]
  }
  const newest = months[0] ?? null
  const inNewest = groups.filter((group) => group.month === newest)
  return inNewest[0] ?? groups[0] ?? null
}
