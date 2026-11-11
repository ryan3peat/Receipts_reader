import { addProjectAction, deleteProjectAction, editProjectAction } from "@/app/(app)/settings/actions"
import { CrudTable } from "@/components/settings/crud"
import { SettingsPageHeader } from "@/components/settings/page-header"
import { omitOwner } from "@/lib/actions"
import { getCurrentUser } from "@/lib/auth"
import { randomHexColor } from "@/lib/utils"
import { getProjects } from "@/models/projects"
import { Prisma } from "@/prisma/client"

export default async function ProjectsSettingsPage() {
  const user = await getCurrentUser()
  const projects = await getProjects(user.id)
  const projectsWithActions = projects.map((project) => ({
    ...project,
    isEditable: true,
    isDeletable: true,
  }))

  return (
    <div className="space-y-6">
      <SettingsPageHeader
        title="Projects"
        description="Use projects to differentiate between the type of activities you do. For example: Freelancing, YouTube channel, Blogging. Projects are just a convenient way to separate statistics."
      />
      <CrudTable
        items={projectsWithActions}
        columns={[
          { key: "name", label: "Name", editable: true },
          { key: "llm_prompt", label: "LLM Prompt", editable: true },
          { key: "color", label: "Color", type: "color", defaultValue: randomHexColor(), editable: true },
        ]}
        onDelete={async (code) => {
          "use server"
          return await deleteProjectAction(code)
        }}
        onAdd={async (data) => {
          "use server"
          return await addProjectAction(omitOwner(data) as Prisma.ProjectCreateInput)
        }}
        onEdit={async (code, data) => {
          "use server"
          return await editProjectAction(code, omitOwner(data) as Prisma.ProjectUpdateInput)
        }}
      />
    </div>
  )
}
