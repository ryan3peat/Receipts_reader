import DashboardDropZoneWidget from "@/components/dashboard/drop-zone-widget"
import { StatsWidget } from "@/components/dashboard/stats-widget"
import DashboardUnsortedWidget from "@/components/dashboard/unsorted-widget"
import { WelcomeWidget } from "@/components/dashboard/welcome-widget"
import { Separator } from "@/components/ui/separator"
import { getActor } from "@/lib/access"
import { getCurrentUser } from "@/lib/auth"
import config from "@/lib/config"
import { getUnsortedFiles } from "@/models/files"
import { getSettings } from "@/models/settings"
import { TransactionFilters } from "@/models/transactions"
import { Loader2 } from "lucide-react"
import { Metadata } from "next"
import { Suspense } from "react"

export const metadata: Metadata = {
  title: "Dashboard",
  description: config.app.description,
}

export default async function Dashboard({ searchParams }: { searchParams: Promise<TransactionFilters> }) {
  const filters = await searchParams
  const [user, actor] = await Promise.all([getCurrentUser(), getActor()])
  const unsortedFiles = await getUnsortedFiles(user.id)
  const settings = await getSettings(user.id)

  return (
    <div className="flex flex-col gap-5 p-5 w-full max-w-7xl self-center">
      {settings.is_welcome_message_hidden !== "true" && <WelcomeWidget />}

      <DashboardDropZoneWidget />

      <DashboardUnsortedWidget files={unsortedFiles} showSubmitter={actor.effectiveRole === "accounts"} />

      <Separator />

      <Suspense
        fallback={
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading overview
          </div>
        }
      >
        <StatsWidget filters={filters} />
      </Suspense>
    </div>
  )
}
