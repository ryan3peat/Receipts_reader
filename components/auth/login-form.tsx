"use client"

import { FormError } from "@/components/forms/error"
import { Button } from "@/components/ui/button"
import { authClient } from "@/lib/auth-client"
import { useState } from "react"

export function LoginForm({ microsoftReady = false }: { microsoftReady?: boolean }) {
  const [isMicrosoftLoading, setIsMicrosoftLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
      <Button type="button" disabled={isMicrosoftLoading} onClick={handleMicrosoft}>
        {isMicrosoftLoading ? "Opening Microsoft..." : "Sign in with Microsoft"}
      </Button>
      {error && <FormError className="text-center">{error}</FormError>}
    </div>
  )
}
