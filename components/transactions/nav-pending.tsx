"use client"

import { cn } from "@/lib/utils"
import { usePathname, useRouter } from "next/navigation"
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useTransition,
  type ReactNode,
} from "react"

type NavPendingContextValue = {
  isPending: boolean
  push: (href: string) => void
}

const NavPendingContext = createContext<NavPendingContextValue | null>(null)

export function TransactionsNavPendingProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const push = useCallback(
    (href: string) => {
      startTransition(() => {
        router.push(href)
      })
    },
    [router]
  )

  const value = useMemo(() => ({ isPending, push }), [isPending, push])

  return <NavPendingContext.Provider value={value}>{children}</NavPendingContext.Provider>
}

export function useTransactionsNavPending() {
  const value = useContext(NavPendingContext)
  if (!value) {
    throw new Error("useTransactionsNavPending must be used under TransactionsNavPendingProvider")
  }
  return value
}

/** Soft nav that keeps the current table on screen when the provider is present. */
export function useTransactionsPush() {
  const pathname = usePathname()
  const router = useRouter()
  const ctx = useContext(NavPendingContext)

  return useCallback(
    (href: string) => {
      if (ctx) {
        ctx.push(href)
        return
      }
      // Outside the transactions shell (e.g. dashboard filters), fall back to a normal push.
      if (pathname.startsWith("/transactions")) {
        router.push(href)
        return
      }
      router.push(href)
    },
    [ctx, pathname, router]
  )
}

export function TransactionsPendingSurface({ children, className }: { children: ReactNode; className?: string }) {
  const ctx = useContext(NavPendingContext)
  const isPending = ctx?.isPending ?? false

  return (
    <div className={cn("relative", className)} aria-busy={isPending || undefined}>
      {isPending && (
        <div className="pointer-events-none absolute inset-x-0 -top-1 z-10 h-0.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full w-1/3 animate-pulse bg-foreground/40" />
        </div>
      )}
      <div className={cn(isPending && "opacity-60 transition-opacity")}>{children}</div>
    </div>
  )
}
