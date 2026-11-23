import CategoryDefaultForm from "@/components/settings/category-default-form"
import { CrudTable } from "@/components/settings/crud"
import { SettingsPageHeader } from "@/components/settings/page-header"
import { Separator } from "@/components/ui/separator"
import { omitOwner } from "@/lib/actions"
import { getCurrentUser } from "@/lib/auth"
import { randomHexColor } from "@/lib/utils"
import { getCategories } from "@/models/categories"
import { getSettings } from "@/models/settings"
import { Prisma } from "@/prisma/client"
import { addCategoryAction, deleteCategoryAction, editCategoryAction } from "@/app/(app)/settings/actions"

export default async function CategoriesSettingsPage() {
  const user = await getCurrentUser()
  const [categories, settings] = await Promise.all([getCategories(user.id), getSettings(user.id)])
  const categoriesWithActions = categories.map((category) => ({
    ...category,
    isEditable: true,
    isDeletable: true,
  }))

  return (
    <div className="space-y-8">
      <SettingsPageHeader
        title="GL codes"
        description="Essential general ledger codes. The model picks one of these codes when it reads a receipt."
      />
      <CategoryDefaultForm settings={settings} categories={categories} />
      <Separator />
      <CrudTable
        items={categoriesWithActions}
        columns={[
          { key: "code", label: "GL Code" },
          { key: "name", label: "Name", editable: true },
          { key: "llm_prompt", label: "LLM Prompt", editable: true },
          { key: "color", label: "Color", type: "color", defaultValue: randomHexColor(), editable: true },
        ]}
        onDelete={async (code) => {
          "use server"
          return await deleteCategoryAction(code)
        }}
        onAdd={async (data) => {
          "use server"
          return await addCategoryAction(omitOwner(data) as Prisma.CategoryCreateInput)
        }}
        onEdit={async (code, data) => {
          "use server"
          return await editCategoryAction(code, omitOwner(data) as Prisma.CategoryUpdateInput)
        }}
      />
    </div>
  )
}
