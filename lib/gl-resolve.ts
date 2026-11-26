// Pure GL rules shared by the cardholder form, the save actions and the SAP export. No database access here.

export type DepartmentSplit = { code: string; percent: number }

export type GlFieldRule = {
  key: string
  name: string
  combined: boolean
  /** Combined fields only: the NR code to post to, or null when Accounts choose at review. */
  postCode: string | null
  /** NR codes behind this field. */
  members: string[]
  /** Department codes this field is shown to. */
  departments: string[]
}

export type EfiLookup = Map<string, { code: string; name: string }>

export function efiKey(nrCode: string, departmentCode: string) {
  return `${nrCode}|${departmentCode}`
}

/** Reads the JSON saved on a transaction. Returns null when there is nothing usable. */
export function parseSplits(raw: unknown): DepartmentSplit[] | null {
  if (!Array.isArray(raw)) return null
  const splits = raw.flatMap((item) => {
    if (!item || typeof item !== "object") return []
    const row = item as Record<string, unknown>
    const code = typeof row.code === "string" ? row.code.trim() : ""
    const percent = typeof row.percent === "number" ? row.percent : Number.parseFloat(String(row.percent ?? ""))
    if (!code || !Number.isFinite(percent) || percent <= 0) return []
    return [{ code, percent }]
  })
  return splits.length > 0 ? splits : null
}

/** Checks a split chosen in the form. Percentages must be whole numbers that add up to 100. */
export function normalizeSplits(
  input: DepartmentSplit[],
  allowedCodes: Set<string>
): { ok: true; splits: DepartmentSplit[] } | { ok: false; error: string } {
  if (input.length === 0) return { ok: false, error: "Choose at least one department" }
  const seen = new Set<string>()
  for (const split of input) {
    if (!allowedCodes.has(split.code)) return { ok: false, error: `Department ${split.code} is not yours` }
    if (seen.has(split.code)) return { ok: false, error: `Department ${split.code} is listed twice` }
    seen.add(split.code)
    if (!Number.isInteger(split.percent) || split.percent <= 0) {
      return { ok: false, error: "Each department needs a whole percentage above 0" }
    }
  }
  const total = input.reduce((sum, split) => sum + split.percent, 0)
  if (total !== 100) return { ok: false, error: `Department split adds up to ${total}%, it must be 100%` }
  return { ok: true, splits: input }
}

/** Splits evenly. Any remainder goes to the first department so the percentages still add up to 100. */
export function equalSplits(codes: string[]): DepartmentSplit[] {
  if (codes.length === 0) return []
  const base = Math.floor(100 / codes.length)
  return codes.map((code, index) => ({
    code,
    percent: index === 0 ? 100 - base * (codes.length - 1) : base,
  }))
}

export function fieldAvailableFor(field: GlFieldRule, departmentCodes: string[]) {
  return departmentCodes.length > 0 && departmentCodes.every((code) => field.departments.includes(code))
}

/** The NR code stored on the transaction. Null means Accounts still have to choose it. */
export function nrCodeForField(field: GlFieldRule): string | null {
  if (!field.combined) return field.members[0] ?? null
  return field.postCode
}

/** Money per department. Each share is rounded, and the last department takes any rounding difference. */
export function departmentShares(
  totalCents: number | null,
  vatCents: number,
  splits: DepartmentSplit[]
): { code: string; totalCents: number | null; vatCents: number }[] {
  if (splits.length <= 1) {
    return [{ code: splits[0]?.code ?? "", totalCents, vatCents }]
  }
  let remainingTotal = totalCents ?? 0
  let remainingVat = vatCents
  return splits.map((split, index) => {
    const isLast = index === splits.length - 1
    const share = isLast ? remainingTotal : Math.round(((totalCents ?? 0) * split.percent) / 100)
    const vat = isLast ? remainingVat : Math.round((vatCents * split.percent) / 100)
    remainingTotal -= share
    remainingVat -= vat
    return { code: split.code, totalCents: totalCents === null ? null : share, vatCents: vat }
  })
}
