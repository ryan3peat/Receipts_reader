import { getActor } from "@/lib/access"
import { Metadata } from "next"
import { redirect } from "next/navigation"

export const metadata: Metadata = {
  title: "Settings",
  description: "Customize your settings here",
}

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const actor = await getActor()
  if (actor.effectiveRole !== "accounts") redirect("/dashboard")
  return <div className="p-10 pb-16">{children}</div>
}
