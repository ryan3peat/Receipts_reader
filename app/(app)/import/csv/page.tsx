import { ImportCSVTable } from "@/components/import/csv"
import { getActor } from "@/lib/access"
import { getCurrentUser } from "@/lib/auth"
import { getFields } from "@/models/fields"
import { redirect } from "next/navigation"

export default async function CSVImportPage() {
  const actor = await getActor()
  if (actor.effectiveRole !== "accounts") redirect("/dashboard")
  const user = await getCurrentUser()
  const fields = await getFields(user.id)
  return (
    <div className="flex flex-col gap-4 p-4">
      <ImportCSVTable fields={fields} />
    </div>
  )
}
