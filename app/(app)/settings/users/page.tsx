import { MembersForm } from "@/components/settings/members-form"
import { SettingsPageHeader } from "@/components/settings/page-header"
import { getActor, listMembers } from "@/lib/access"
import { getMasterAdminEmail } from "@/lib/master-admin"
import { getCompanyEmailDomain } from "@/lib/sign-in-enrolment"

export default async function UsersSettingsPage() {
  const [actor, members] = await Promise.all([getActor(), listMembers()])
  const domain = getCompanyEmailDomain()
  const whoCanSignIn = domain
    ? `Anyone with an @${domain} Microsoft account can sign in and appears here after their first sign-in, starting as Sales.`
    : "Only people on this list can sign in."

  return (
    <div className="space-y-6">
      <SettingsPageHeader
        title="People"
        description={`${whoCanSignIn} Sales can upload and see their own receipts. Accounts can see every expense, change settings, and download reports. Names come from Microsoft 365.`}
      />
      <MembersForm
        members={members}
        companyUserId={actor.companyUser.id}
        masterAdminEmail={getMasterAdminEmail()}
        canManage={actor.isMaster}
        selfEnrolDomain={domain}
      />
    </div>
  )
}
