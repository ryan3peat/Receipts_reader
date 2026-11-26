import { PersonDepartments } from "@/components/settings/person-departments"
import { MembersForm } from "@/components/settings/members-form"
import { SettingsPageHeader } from "@/components/settings/page-header"
import { getActor, listMembers } from "@/lib/access"
import { getMasterAdminEmail } from "@/lib/master-admin"
import { getCompanyEmailDomain } from "@/lib/sign-in-enrolment"
import { departmentsByPerson, listDepartments } from "@/models/gl-departments"

export default async function UsersSettingsPage() {
  const [actor, members] = await Promise.all([getActor(), listMembers()])
  const [departments, byPerson] = await Promise.all([
    listDepartments(actor.companyUser.id),
    departmentsByPerson(actor.companyUser.id),
  ])
  const domain = getCompanyEmailDomain()
  const whoCanSignIn = domain
    ? `Anyone with an @${domain} Microsoft account can sign in and appears here after their first sign-in, starting as Cardholder.`
    : "Only people on this list can sign in."

  return (
    <div className="space-y-6">
      <SettingsPageHeader
        title="People"
        description={`${whoCanSignIn} Cardholders can upload and see their own receipts. Accounts can see every expense, change settings, and download reports. Names come from Microsoft 365.`}
      />
      <MembersForm
        members={members}
        companyUserId={actor.companyUser.id}
        masterAdminEmail={getMasterAdminEmail()}
        canManage={actor.isMaster}
        selfEnrolDomain={domain}
      />

      <section className="space-y-3 pt-6">
        <h3 className="text-lg font-semibold">Departments</h3>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Each person sees the GL codes for their departments. Give someone more than one department and they can split a
          receipt across them. The default is the one used when they do not choose.
        </p>
        <PersonDepartments
          people={members.map((member) => ({
            id: member.id,
            name: member.name,
            email: member.email,
            employeeCode: null,
            departments: byPerson.get(member.id) ?? [],
          }))}
          departments={departments}
        />
      </section>
    </div>
  )
}
