"use client"

import { addMemberAction, updateMemberRoleAction } from "@/app/(app)/settings/users/actions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useActionState, useState, useTransition } from "react"

type Member = { id: string; email: string; name: string; role: string }

function isCardholderRole(role: string) {
  return role === "cardholder" || role === "sales"
}

export function MembersForm({
  members,
  companyUserId,
  masterAdminEmail,
  canManage,
  selfEnrolDomain,
}: {
  members: Member[]
  companyUserId: string
  masterAdminEmail: string | null
  canManage: boolean
  selfEnrolDomain: string | null
}) {
  const [state, action, pending] = useActionState(addMemberAction, null)
  const [role, setRole] = useState("cardholder")
  const [updating, startUpdate] = useTransition()
  const [roleError, setRoleError] = useState<string | null>(null)

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        {members.map((member) => {
          const isMaster = masterAdminEmail !== null && member.email === masterAdminEmail
          return (
            <div key={member.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
              <div>
                <p className="flex flex-wrap items-center gap-2 font-medium">
                  {member.name}
                  {isMaster && <Badge variant="outline">Master Admin</Badge>}
                </p>
                <p className="text-sm text-muted-foreground">{member.email}</p>
              </div>
              <Select
                value={isCardholderRole(member.role) && !isMaster ? "cardholder" : "accounts"}
                disabled={!canManage || updating || member.id === companyUserId || isMaster}
                onValueChange={(value) => {
                  setRoleError(null)
                  startUpdate(async () => {
                    const result = await updateMemberRoleAction(
                      member.id,
                      value === "accounts" ? "accounts" : "cardholder"
                    )
                    if (!result.success) setRoleError(result.error || "Could not change the role")
                  })
                }}
              >
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="accounts">Accounts</SelectItem>
                  <SelectItem value="cardholder">Cardholder</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )
        })}
        {roleError && <p className="text-sm text-red-600">{roleError}</p>}
      </div>

      {canManage ? (
        <form action={action} className="space-y-3 max-w-md">
          <h3 className="text-lg font-semibold">Add a person</h3>
          {selfEnrolDomain && (
            <p className="text-sm text-muted-foreground">
              Only needed to give someone the Accounts role before they first sign in, or to let in an address
              outside @{selfEnrolDomain}.
            </p>
          )}
          <Input name="name" placeholder="Name" required />
          <Input name="email" type="email" placeholder="Microsoft 365 email" required />
          <input type="hidden" name="role" value={role} />
          <Select value={role} onValueChange={setRole}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="cardholder">Cardholder</SelectItem>
              <SelectItem value="accounts">Accounts</SelectItem>
            </SelectContent>
          </Select>
          {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
          {state?.success && <p className="text-sm text-green-600">Person added. They can sign in with Microsoft.</p>}
          <Button type="submit" disabled={pending}>
            {pending ? "Adding..." : "Add person"}
          </Button>
        </form>
      ) : (
        <p className="text-sm text-muted-foreground">Only the Master Admin can add people or change roles.</p>
      )}
    </div>
  )
}
