import { SubscriptionExpired } from "@/components/auth/subscription-expired"
import ScreenDropArea from "@/components/files/screen-drop-area"
import MobileMenu from "@/components/sidebar/mobile-menu"
import { MobileShortcuts } from "@/components/sidebar/mobile-shortcuts"
import { AppSidebar } from "@/components/sidebar/sidebar"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { Toaster } from "@/components/ui/sonner"
import { getActor } from "@/lib/access"
import { getCurrentUser, isSubscriptionExpired } from "@/lib/auth"
import config from "@/lib/config"
import { getApps } from "@/app/(app)/apps/common"
import { getUnsortedFilesCount } from "@/models/files"
import type { Metadata, Viewport } from "next"
import "../globals.css"
import { NotificationProvider } from "./context"

export const metadata: Metadata = {
  title: {
    template: "%s | EF Expenses",
    default: config.app.title,
  },
  description: config.app.description,
}

export const viewport: Viewport = {
  themeColor: "#ffffff",
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [user, actor] = await Promise.all([getCurrentUser(), getActor()])
  const [unsortedFilesCount, apps] = await Promise.all([getUnsortedFilesCount(user.id), getApps()])

  const userProfile = {
    id: user.id,
    name: user.name || "",
    email: user.email,
    avatar: user.avatar ? user.avatar + "?" + user.id : undefined,
    membershipPlan: user.membershipPlan || "unlimited",
    storageUsed: user.storageUsed || 0,
    storageLimit: user.storageLimit || -1,
    aiBalance: user.aiBalance || 0,
  }

  return (
    <NotificationProvider>
      <ScreenDropArea>
        <SidebarProvider>
          <MobileMenu unsortedFilesCount={unsortedFilesCount} />
          <AppSidebar
            profile={userProfile}
            unsortedFilesCount={unsortedFilesCount}
            isSelfHosted={config.selfHosted.isEnabled}
            showSettings={actor.effectiveRole === "accounts"}
            showLoginToggle={actor.realRole === "accounts" && !actor.userView}
            showUserView={actor.realRole === "accounts"}
            loginRequired={actor.loginRequired}
            userView={actor.userView}
            apps={apps.map((app) => ({
              id: app.id,
              name: app.manifest.name,
              icon: app.manifest.icon,
            }))}
          />
          <SidebarInset className="w-full h-full mt-[60px] md:mt-0 overflow-auto pb-20 md:pb-0">
            {actor.userView && (
              <div className="border-b bg-amber-50 px-4 py-2 text-sm text-amber-950">
                User View is on. You are seeing the sales experience. Turn it off in the sidebar to return to accounts.
              </div>
            )}
            {isSubscriptionExpired(user) && <SubscriptionExpired />}
            {children}
          </SidebarInset>
          <MobileShortcuts />
        </SidebarProvider>
        <Toaster />
      </ScreenDropArea>
    </NotificationProvider>
  )
}

export const dynamic = "force-dynamic"
