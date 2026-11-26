"use client"

import type { GlPicker } from "@/lib/gl-options"
import { equalSplits, type DepartmentSplit } from "@/lib/gl-resolve"
import { useState } from "react"

type Props = {
  picker: GlPicker
  /** GL field key the receipt already has, or the NR code to match against a field. */
  initialCode: string | null | undefined
  initialSplits?: DepartmentSplit[] | null
  title: string
}

// The cardholder's own departments. Ticking more than one splits the receipt by percentage.
// The GL list only offers codes that are shown to every ticked department.
export function GlDepartmentPicker({ picker, initialCode, initialSplits, title }: Props) {
  const knownCodes = new Set(picker.departments.map((department) => department.code))
  const home = picker.departments.find((department) => department.isDefault) ?? picker.departments[0]

  const [checked, setChecked] = useState<string[]>(() => {
    const valid = (initialSplits ?? []).filter((split) => knownCodes.has(split.code))
    if (valid.length > 0) return valid.map((split) => split.code)
    return home ? [home.code] : []
  })
  const [percents, setPercents] = useState<Record<string, number>>(() => {
    const valid = (initialSplits ?? []).filter((split) => knownCodes.has(split.code))
    if (valid.length > 0) return Object.fromEntries(valid.map((split) => [split.code, split.percent]))
    return home ? { [home.code]: 100 } : {}
  })
  const [code, setCode] = useState<string>(() => {
    const exact = picker.fields.find((field) => field.key === initialCode)
    if (exact) return exact.key
    const member = picker.fields.find((field) => initialCode && field.members.includes(initialCode))
    return member?.key ?? ""
  })

  const available = picker.fields.filter((field) => checked.every((item) => field.departments.includes(item)))
  const effectiveCode = available.some((field) => field.key === code) ? code : (available[0]?.key ?? "")
  const splits: DepartmentSplit[] = checked.map((item) => ({ code: item, percent: percents[item] ?? 0 }))
  const total = splits.reduce((sum, split) => sum + split.percent, 0)

  function toggle(departmentCode: string) {
    const next = checked.includes(departmentCode)
      ? checked.filter((item) => item !== departmentCode)
      : [...checked, departmentCode]
    if (next.length === 0) return
    const ordered = picker.departments.map((department) => department.code).filter((item) => next.includes(item))
    setChecked(ordered)
    setPercents(Object.fromEntries(equalSplits(ordered).map((split) => [split.code, split.percent])))
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <p className="text-sm font-medium">Charge to department</p>
        {picker.departments.map((department) => {
          const on = checked.includes(department.code)
          return (
            <label
              key={department.code}
              className={`flex items-center gap-3 rounded-md border p-2 text-sm ${on ? "border-primary bg-muted/40" : ""}`}
            >
              <input type="checkbox" checked={on} onChange={() => toggle(department.code)} />
              <span className="flex-1">
                {department.code} {department.name}
                {department.isDefault && <span className="ml-2 text-xs text-muted-foreground">your department</span>}
              </span>
              {on && checked.length > 1 && (
                <span className="flex items-center gap-1">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    value={percents[department.code] ?? 0}
                    onChange={(event) =>
                      setPercents({ ...percents, [department.code]: Number.parseInt(event.target.value || "0", 10) })
                    }
                    className="w-20 rounded-md border bg-background px-2 py-1 text-right"
                  />
                  <span className="text-muted-foreground">%</span>
                </span>
              )}
            </label>
          )
        })}
        {checked.length > 1 && (
          <p className={`text-xs ${total === 100 ? "text-green-600" : "text-red-600"}`}>
            {total === 100 ? "Splitting across departments, 100%" : `Adds up to ${total}%, it needs to be 100%`}
          </p>
        )}
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium" htmlFor="gl-code-picker">
          {title}
        </label>
        <select
          id="gl-code-picker"
          value={effectiveCode}
          onChange={(event) => setCode(event.target.value)}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
        >
          {available.length === 0 && <option value="">No GL code is shared by every ticked department</option>}
          {available.map((field) => (
            <option key={field.key} value={field.key}>
              {field.combined ? field.name : `${field.key} ${field.name}`}
            </option>
          ))}
        </select>
        {checked.length > 1 && available.length === 0 && (
          <p className="text-xs text-muted-foreground">Untick a department to see more GL codes.</p>
        )}
      </div>

      <input type="hidden" name="categoryCode" value={effectiveCode} />
      <input type="hidden" name="departmentSplits" value={JSON.stringify(splits)} />
    </div>
  )
}
