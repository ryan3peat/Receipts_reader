"use client"

import { FormError } from "@/components/forms/error"
import { FormInput } from "@/components/forms/simple"
import { Button } from "@/components/ui/button"
import { authClient } from "@/lib/auth-client"
import { useRouter } from "next/navigation"
import { useState } from "react"

export function LoginForm({
  defaultEmail,
  microsoftReady = false,
  devEmail,
}: {
  defaultEmail?: string
  microsoftReady?: boolean
  devEmail?: string
}) {
  const [email, setEmail] = useState(devEmail || defaultEmail || "")
  const [password, setPassword] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isMicrosoftLoading, setIsMicrosoftLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const handleDev = async (event: React.FormEvent) => {
    event.preventDefault()
    setIsLoading(true)
    setError(null)
    try {
      const result = await authClient.signIn.email({
        email,
        password,
        callbackURL: "/dashboard",
      })
      if (result.error) {
        setError(result.error.message || "Developer sign-in failed")
        return
      }
      router.push("/dashboard")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Developer sign-in failed")
    } finally {
      setIsLoading(false)
    }
  }

  const handleMicrosoft = async () => {
    if (!microsoftReady) {
      setError("Microsoft sign-in is waiting for the Entra app ID, secret, and tenant.")
      return
    }
    setIsMicrosoftLoading(true)
    setError(null)
    const result = await authClient.signIn.social({
      provider: "microsoft",
      callbackURL: "/dashboard",
      errorCallbackURL: "/enter",
    })
    if (result?.error) {
      setError(result.error.message || "Microsoft sign-in failed")
      setIsMicrosoftLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 w-full">
      <Button type="button" disabled={isMicrosoftLoading || isLoading} onClick={handleMicrosoft}>
        {isMicrosoftLoading ? "Opening Microsoft..." : "Sign in with Microsoft"}
      </Button>
      {devEmail && (
        <form onSubmit={handleDev} className="flex flex-col gap-4 w-full">
          <p className="text-center text-sm text-muted-foreground">
            Developer sign-in until the Microsoft redirect URI is registered
          </p>
          <FormInput title="Email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          <FormInput
            title="Password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
          <Button type="submit" disabled={isLoading}>
            {isLoading ? "Loading..." : "Sign in"}
          </Button>
        </form>
      )}
      {error && <FormError className="text-center">{error}</FormError>}
    </div>
  )
}
