"use client"

import { setLoginRequiredAction, setUserViewAction } from "@/app/(app)/access/actions"
import { cn } from "@/lib/utils"
import { useState, useTransition } from "react"

function Switch({
  label,
  checked,
  disabled,
  onCheckedChange,
}: {
  label: string
  checked: boolean
  disabled?: boolean
  onCheckedChange: (checked: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-2 py-1">
      <span className="text-sm">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onCheckedChange(!checked)}
        className={cn(
          "relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50",
          checked ? "bg-primary" : "bg-muted-foreground/30"
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all",
            checked ? "left-5" : "left-0.5"
          )}
        />
      </button>
    </div>
  )
}

export function AccessToggles({
  loginRequired,
  userView,
  showLogin,
}: {
  loginRequired: boolean
  userView: boolean
  showLogin: boolean
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="group-data-[collapsible=icon]:hidden">
      {showLogin && (
        <Switch
          label="Login"
          checked={loginRequired}
          disabled={pending}
          onCheckedChange={(checked) => {
            setError(null)
            startTransition(async () => {
              const result = await setLoginRequiredAction(checked)
              if (!result.success) setError(result.error)
            })
          }}
        />
      )}
      <Switch
        label="User View"
        checked={userView}
        disabled={pending}
        onCheckedChange={(checked) => {
          setError(null)
          startTransition(async () => {
            const result = await setUserViewAction(checked)
            if (!result.success) setError(result.error)
          })
        }}
      />
      {error && <p className="px-2 text-xs text-red-600">{error}</p>}
    </div>
  )
}
