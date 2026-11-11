import { LoginForm } from "@/components/auth/login-form"
import { Card, CardContent, CardTitle } from "@/components/ui/card"
import { ColoredText } from "@/components/ui/colored-text"
import { isLoginRequired } from "@/lib/access"
import config from "@/lib/config"
import Image from "next/image"
import { redirect } from "next/navigation"

export default async function LoginPage() {
  if (config.selfHosted.isEnabled && !(await isLoginRequired())) {
    redirect(config.selfHosted.redirectUrl)
  }

  return (
    <Card className="w-full max-w-xl mx-auto p-8 flex flex-col items-center justify-center gap-4">
      <Image src="/logo/512.png" alt="Logo" width={144} height={144} className="w-36 h-36" />
      <CardTitle className="text-3xl font-bold ">
        <ColoredText>EF Expenses</ColoredText>
      </CardTitle>
      <CardContent className="w-full">
        <LoginForm microsoftReady={config.auth.microsoft !== null} />
      </CardContent>
    </Card>
  )
}
