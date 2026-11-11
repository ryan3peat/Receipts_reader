import { MembersForm } from "@/components/settings/members-form"
import { SettingsPageHeader } from "@/components/settings/page-header"
import { getActor, listMembers } from "@/lib/access"

export default async function UsersSettingsPage() {
  const [actor, members] = await Promise.all([getActor(), listMembers()])

  return (
    <div className="space-y-6">
      <SettingsPageHeader
        title="People"
        description="Sales can upload their own receipts. Accounts can see every expense, change settings, and download reports."
      />
      <MembersForm members={members} companyUserId={actor.companyUser.id} />
    </div>
  )
}
