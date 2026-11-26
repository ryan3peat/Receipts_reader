"use client"

import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { GlPicker } from "@/lib/gl-options"
import { equalSplits, type DepartmentSplit } from "@/lib/gl-resolve"
import { Plus, X } from "lucide-react"
import { useMemo, useState } from "react"

type Props = {
  picker: GlPicker
  /** GL field key the receipt already has, or the NR code to match against a field. */
  initialCode: string | null | undefined
  initialSplits?: DepartmentSplit[] | null
  /** Label above the category list. Defaults to Category for cardholders. */
  title?: string
}

// Default charge is the cardholder's own department, shown as a tag.
// "Add others" lets them split the receipt across more departments.
// The category list only offers names shown to every ticked department.
export function GlDepartmentPicker({ picker, initialCode, initialSplits, title = "Category" }: Props) {
  const knownCodes = new Set(picker.departments.map((department) => department.code))
  const home = picker.departments.find((department) => department.isDefault) ?? picker.departments[0]
  const nameOf = useMemo(
    () => new Map(picker.departments.map((department) => [department.code, department.name])),
    [picker.departments]
  )

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
  const [addOpen, setAddOpen] = useState(false)

  const available = picker.fields.filter((field) => checked.every((item) => field.departments.includes(item)))
  const effectiveCode = available.some((field) => field.key === code) ? code : (available[0]?.key ?? "")
  const splits: DepartmentSplit[] = checked.map((item) => ({ code: item, percent: percents[item] ?? 0 }))
  const total = splits.reduce((sum, split) => sum + split.percent, 0)
  const others = picker.departments.filter((department) => !checked.includes(department.code))

  function setDepartments(next: string[]) {
    if (next.length === 0) return
    const ordered = picker.departments.map((department) => department.code).filter((item) => next.includes(item))
    setChecked(ordered)
    setPercents(Object.fromEntries(equalSplits(ordered).map((split) => [split.code, split.percent])))
  }

  function addDepartment(departmentCode: string) {
    if (checked.includes(departmentCode)) return
    setDepartments([...checked, departmentCode])
    setAddOpen(false)
  }

  function removeDepartment(departmentCode: string) {
    if (checked.length <= 1) return
    setDepartments(checked.filter((item) => item !== departmentCode))
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label className="text-sm font-medium" htmlFor="category-picker">
          {title}
        </label>
        <Select value={effectiveCode || undefined} onValueChange={setCode} disabled={available.length === 0}>
          <SelectTrigger id="category-picker" className="h-10 bg-background">
            <SelectValue placeholder={available.length === 0 ? "No shared category for these departments" : "Select category"} />
          </SelectTrigger>
          <SelectContent>
            {available.map((field) => (
              <SelectItem key={field.key} value={field.key}>
                {field.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {checked.length > 1 && available.length === 0 && (
          <p className="text-xs text-muted-foreground">Remove a department to see more categories.</p>
        )}
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Charge to</p>
        <div className="flex flex-wrap items-center gap-2">
          {checked.map((departmentCode) => {
            const isHome = home?.code === departmentCode
            return (
              <span
                key={departmentCode}
                className="inline-flex items-center gap-1.5 rounded-full border bg-muted/50 px-3 py-1 text-sm"
              >
                <span className="font-medium">{nameOf.get(departmentCode) ?? departmentCode}</span>
                {isHome && <span className="text-xs text-muted-foreground">yours</span>}
                {checked.length > 1 && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={1}
                      value={percents[departmentCode] ?? 0}
                      onChange={(event) =>
                        setPercents({
                          ...percents,
                          [departmentCode]: Number.parseInt(event.target.value || "0", 10),
                        })
                      }
                      className="w-12 rounded-md border bg-background px-1 py-0.5 text-right text-foreground"
                      aria-label={`Percent for ${nameOf.get(departmentCode) ?? departmentCode}`}
                    />
                    %
                  </span>
                )}
                {checked.length > 1 && (
                  <button
                    type="button"
                    className="rounded-full p-0.5 text-muted-foreground hover:bg-background hover:text-foreground"
                    title="Remove department"
                    onClick={() => removeDepartment(departmentCode)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </span>
            )
          })}

          {others.length > 0 && (
            <Popover open={addOpen} onOpenChange={setAddOpen}>
              <PopoverTrigger asChild>
                <Button type="button" variant="outline" size="sm" className="h-8 rounded-full px-3">
                  <Plus className="h-3.5 w-3.5" />
                  Add others
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-64 p-2">
                <p className="px-2 pb-2 text-xs text-muted-foreground">Split this receipt with another department</p>
                <div className="max-h-56 space-y-1 overflow-y-auto">
                  {others.map((department) => (
                    <button
                      key={department.code}
                      type="button"
                      className="flex w-full items-center rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                      onClick={() => addDepartment(department.code)}
                    >
                      {department.name}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          )}
        </div>
        {checked.length > 1 && (
          <p className={`text-xs ${total === 100 ? "text-green-600" : "text-red-600"}`}>
            {total === 100 ? "Splitting across departments, 100%" : `Adds up to ${total}%, it needs to be 100%`}
          </p>
        )}
      </div>

      <input type="hidden" name="categoryCode" value={effectiveCode} />
      <input type="hidden" name="departmentSplits" value={JSON.stringify(splits)} />
    </div>
  )
}
