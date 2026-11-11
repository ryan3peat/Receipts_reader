import { Card, CardDescription, CardTitle } from "@/components/ui/card"
import config from "@/lib/config"
import { ShieldAlert } from "lucide-react"
import { redirect } from "next/navigation"

export default async function SelfHostedWelcomePage() {
  if (!config.selfHosted.isEnabled) {
    return (
      <Card className="w-full max-w-xl mx-auto p-8 flex flex-col items-center justify-center gap-6">
        <CardTitle className="text-2xl font-bold flex items-center gap-2">
          <ShieldAlert className="w-6 h-6" />
          <span>Self-Hosted Mode is not enabled</span>
        </CardTitle>
        <CardDescription className="text-center text-lg flex flex-col gap-2">
          <p>
            To use EF Expenses in self-hosted mode, please set <code className="font-bold">SELF_HOSTED_MODE=true</code> in
            your environment.
          </p>
          <p>In self-hosted mode you can use your own ChatGPT API key and store your data on your own server.</p>
        </CardDescription>
      </Card>
    )
  }

  redirect(config.selfHosted.redirectUrl)
}

export const dynamic = "force-dynamic"
