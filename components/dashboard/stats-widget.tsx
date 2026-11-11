import { CategoryBreakdownChart } from "@/components/dashboard/category-breakdown-chart"
import { FiltersWidget } from "@/components/dashboard/filters-widget"
import { IncomeExpenseGraph } from "@/components/dashboard/income-expense-graph"
import { getCurrentUser } from "@/lib/auth"
import { calcAveragePerPeriod, sumCategoryTotals } from "@/lib/stats"
import { getSettings } from "@/models/settings"
import { getDetailedTimeSeriesStats } from "@/models/stats"
import { TransactionFilters } from "@/models/transactions"

export async function StatsWidget({ filters }: { filters: TransactionFilters }) {
  const user = await getCurrentUser()
  const settings = await getSettings(user.id)
  const defaultCurrency = settings.default_currency || "EUR"

  const statsTimeSeries = await getDetailedTimeSeriesStats(user.id, filters, defaultCurrency)
  const averages = calcAveragePerPeriod(statsTimeSeries, filters)

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Overview</h2>

        <FiltersWidget defaultFilters={filters} defaultRange="last-12-months" />
      </div>

      {averages && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <IncomeExpenseGraph data={statsTimeSeries} defaultCurrency={defaultCurrency} />
          <CategoryBreakdownChart
            expenses={sumCategoryTotals(statsTimeSeries, "expenses")}
            income={[]}
            currency={defaultCurrency}
            averages={averages}
            filters={{ dateFrom: filters.dateFrom, dateTo: filters.dateTo }}
            expensesOnly
          />
        </div>
      )}
    </div>
  )
}
