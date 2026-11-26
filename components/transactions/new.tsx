import { getActor } from "@/lib/access"
import { getCurrentUser } from "@/lib/auth"
import { glFormChoices } from "@/lib/gl-options"
import { getCurrencies } from "@/models/currencies"
import { getProjects } from "@/models/projects"
import { getSettings } from "@/models/settings"
import { NewTransactionDialogClient } from "./new-dialog"

export async function NewTransactionDialog({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser()
  const actor = await getActor()
  const { options, picker } = await glFormChoices(actor)
  const currencies = await getCurrencies(user.id)
  const settings = await getSettings(user.id)
  const projects = await getProjects(user.id)

  return (
    <NewTransactionDialogClient
      categories={options}
      picker={picker}
      currencies={currencies}
      settings={settings}
      projects={projects}
    >
      {children}
    </NewTransactionDialogClient>
  )
}
