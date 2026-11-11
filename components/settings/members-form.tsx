"use client"

import { addMemberAction, updateMemberRoleAction } from "@/app/(app)/settings/users/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useActionState, useState, useTransition } from "react"

type Member = { id: string; email: string; name: string; role: string }

export function MembersForm({ members, companyUserId }: { members: Member[]; companyUserId: string }) {
  const [state, action, pending] = useActionState(addMemberAction, null)
  const [role, setRole] = useState("sales")
  const [updating, startUpdate] = useTransition()

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        {members.map((member) => (
          <div key={member.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
            <div>
              <p className="font-medium">{member.name}</p>
              <p className="text-sm text-muted-foreground">{member.email}</p>
            </div>
            <Select
              value={member.role === "sales" ? "sales" : "accounts"}
              disabled={updating || member.id === companyUserId}
              onValueChange={(value) => {
                startUpdate(async () => {
                  await updateMemberRoleAction(member.id, value === "accounts" ? "accounts" : "sales")
                })
              }}
            >
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="accounts">Accounts</SelectItem>
                <SelectItem value="sales">Sales</SelectItem>
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>

      <form action={action} className="space-y-3 max-w-md">
        <h3 className="text-lg font-semibold">Add a person</h3>
        <Input name="name" placeholder="Name" required />
        <Input name="email" type="email" placeholder="Email" required />
        <input type="hidden" name="role" value={role} />
        <Select value={role} onValueChange={setRole}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="sales">Sales</SelectItem>
            <SelectItem value="accounts">Accounts</SelectItem>
          </SelectContent>
        </Select>
        {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
        {state?.success && <p className="text-sm text-green-600">Person added. They can sign in when Login is on.</p>}
        <Button type="submit" disabled={pending}>
          {pending ? "Adding..." : "Add person"}
        </Button>
      </form>
    </div>
  )
}
