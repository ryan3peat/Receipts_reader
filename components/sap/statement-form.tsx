"use client"

import { importStatementAction } from "@/app/(app)/sap/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useActionState, useState } from "react"

export type SapEmployee = {
  id: string
  name: string
  email: string
  employeeCode: string | null
  cardNumber: string | null
}

export function StatementForm({ employees }: { employees: SapEmployee[] }) {
  const [state, action, pending] = useActionState(importStatementAction, null)
  const [employeeId, setEmployeeId] = useState(employees[0]?.id ?? "")
  const selected = employees.find((employee) => employee.id === employeeId) ?? employees[0]
  const [employeeCode, setEmployeeCode] = useState(selected?.employeeCode ?? "")
  const [cardNumber, setCardNumber] = useState(selected?.cardNumber ?? "")

  const chooseEmployee = (id: string) => {
    const employee = employees.find((item) => item.id === id)
    setEmployeeId(id)
    setEmployeeCode(employee?.employeeCode ?? "")
    setCardNumber(employee?.cardNumber ?? "")
  }

  if (employees.length === 0) {
    return <p className="text-sm text-muted-foreground">Add an employee before uploading a statement.</p>
  }

  return (
    <div className="space-y-4 max-w-xl">
      <form action={action} className="space-y-3">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Employee
          <Select value={employeeId} onValueChange={chooseEmployee}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {employees.map((employee) => (
                <SelectItem key={employee.id} value={employee.id}>
                  {employee.name || employee.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <input type="hidden" name="employeeId" value={employeeId} />
        <label className="flex flex-col gap-1 text-sm font-medium">
          Employee code
          <Input name="employeeCode" value={employeeCode} onChange={(event) => setEmployeeCode(event.target.value)} placeholder="ANNMAD" />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Card number
          <Input name="cardNumber" value={cardNumber} onChange={(event) => setCardNumber(event.target.value)} placeholder="4336-8771-0279-0829" />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Credit card statement PDF
          <Input name="statement" type="file" accept="application/pdf,.pdf" required />
        </label>
        <Button type="submit" disabled={pending}>
          {pending ? "Reading statement..." : "Read statement and build FOR SAP"}
        </Button>
      </form>

      <form action="/sap/receipts" method="get">
        <input type="hidden" name="employeeId" value={employeeId} />
        <Button type="submit" variant="outline">
          Download FOR SAP from receipts only
        </Button>
      </form>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state?.success && (
        <div className="space-y-2 text-sm">
          <p>
            {state.missing
              ? `${state.missing} card transaction${state.missing === 1 ? "" : "s"} have no receipt. They are highlighted on the FOR SAP sheet.`
              : "Every purchase on the statement has a receipt."}
          </p>
          <p className="text-muted-foreground">
            {state.emailed
              ? "The employee was emailed the missing transactions."
              : "Email is not set up yet, so the missing list is shown here and on the employee home screen."}
          </p>
          {state.statementId && (
            <a className="underline" href={`/sap/${state.statementId}`}>
              Download FOR SAP sheet
            </a>
          )}
        </div>
      )}
    </div>
  )
}
