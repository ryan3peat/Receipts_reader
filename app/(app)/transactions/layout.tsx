import { TransactionsNavPendingProvider } from "@/components/transactions/nav-pending"

export default function TransactionsLayout({ children }: { children: React.ReactNode }) {
  return (
    <TransactionsNavPendingProvider>
      <div className="flex flex-col gap-4 p-4">{children}</div>
    </TransactionsNavPendingProvider>
  )
}
