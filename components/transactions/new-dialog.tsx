"use client"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import type { GlOption, GlPicker } from "@/lib/gl-options"
import { Currency, Project } from "@/prisma/client"
import TransactionCreateForm from "./create"

export function NewTransactionDialogClient({
  children,
  categories,
  picker,
  currencies,
  settings,
  projects,
}: {
  children: React.ReactNode
  categories: GlOption[]
  picker: GlPicker | null
  currencies: Currency[]
  settings: Record<string, string>
  projects: Project[]
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button>{children}</Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">New Transaction</DialogTitle>
          <DialogDescription>Create a new transaction</DialogDescription>
        </DialogHeader>

        <TransactionCreateForm
          categories={categories}
          picker={picker}
          currencies={currencies}
          settings={settings}
          projects={projects}
        />
      </DialogContent>
    </Dialog>
  )
}
