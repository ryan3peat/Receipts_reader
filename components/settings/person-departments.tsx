"use client"

import { setPersonDepartmentsAction } from "@/app/(app)/settings/users/actions"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"

export type PersonRow = {
  id: string
  name: string
  email: string
  employeeCode: string | null
  departments: { code: string; name: string; isDefault: boolean }[]
}

export function PersonDepartments({
  people,
  departments,
}: {
  people: PersonRow[]
  departments: { code: string; name: string }[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function save(person: PersonRow, codes: string[], defaultCode: string) {
    setError(null)
    startTransition(async () => {
      const result = await setPersonDepartmentsAction(person.id, codes, defaultCode)
      if (!result.success) setError(`${person.name}: ${result.error}`)
      router.refresh()
    })
  }

  if (departments.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Departments are set up on the GL codes page. Once they exist, assign each person here.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {people.map((person) => {
        const codes = person.departments.map((department) => department.code)
        const defaultCode = person.departments.find((department) => department.isDefault)?.code ?? codes[0] ?? ""
        return (
          <div key={person.id} className="flex flex-col gap-2 rounded-md border p-3 md:flex-row md:items-center">
            <div className="min-w-0 md:w-64">
              <p className="font-medium">{person.name}</p>
              <p className="text-xs text-muted-foreground">
                {person.employeeCode ? `${person.employeeCode} · ` : ""}
                {person.email}
              </p>
            </div>
            <div className="flex flex-1 flex-wrap gap-2">
              {departments.map((department) => {
                const on = codes.includes(department.code)
                return (
                  <button
                    key={department.code}
                    disabled={pending}
                    onClick={() => {
                      const next = on ? codes.filter((code) => code !== department.code) : [...codes, department.code]
                      if (next.length === 0) return setError(`${person.name} needs at least one department`)
                      const nextDefault = next.includes(defaultCode) ? defaultCode : next[0]
                      save(person, next, nextDefault)
                    }}
                    className={`rounded-full border px-3 py-1 text-xs ${on ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
                  >
                    {department.code} {department.name}
                  </button>
                )
              })}
            </div>
            {codes.length > 1 && (
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                Default
                <select
                  disabled={pending}
                  value={defaultCode}
                  onChange={(event) => save(person, codes, event.target.value)}
                  className="rounded-md border bg-background px-2 py-1 text-sm text-foreground"
                >
                  {person.departments.map((department) => (
                    <option key={department.code} value={department.code}>
                      {department.code} {department.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {codes.length === 0 && <span className="text-xs text-amber-700">No department yet</span>}
          </div>
        )
      })}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  )
}
