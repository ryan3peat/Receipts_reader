import LandingPage from "@/app/landing/landing"
import { isLoginRequired } from "@/lib/access"
import { getSession } from "@/lib/auth"
import config from "@/lib/config"
import { redirect } from "next/navigation"

export default async function Home() {
  const session = await getSession()
  if (!session) {
    if (config.selfHosted.isEnabled) {
      redirect((await isLoginRequired()) ? config.auth.loginUrl : config.selfHosted.redirectUrl)
    }
    return <LandingPage />
  }

  redirect("/dashboard")
}

export const dynamic = "force-dynamic"
