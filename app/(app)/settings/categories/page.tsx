import CategoryDefaultForm from "@/components/settings/category-default-form"
import { GlCodesBoard } from "@/components/settings/gl-codes-board"
import { SettingsPageHeader } from "@/components/settings/page-header"
import { Separator } from "@/components/ui/separator"
import { getCurrentUser } from "@/lib/auth"
import { getCategories } from "@/models/categories"
import { getGlBoardData, listDepartments } from "@/models/gl-departments"
import { getSettings } from "@/models/settings"

export default async function CategoriesSettingsPage() {
  const user = await getCurrentUser()
  const [categories, settings, board, departments] = await Promise.all([
    getCategories(user.id),
    getSettings(user.id),
    getGlBoardData(user.id),
    listDepartments(user.id),
  ])

  return (
    <div className="space-y-8">
      <SettingsPageHeader
        title="GL codes"
        description="Choose which GL codes each department sees when claiming. Cardholders only see the GL codes shown to their departments. Accounts map each one to the department's EFI code for SAP."
      />
      <GlCodesBoard data={board} hasDepartments={departments.length > 0} />
      <Separator />
      <CategoryDefaultForm settings={settings} categories={categories} />
    </div>
  )
}
