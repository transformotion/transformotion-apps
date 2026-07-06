"use client"

import { useMemo } from "react"
import { useBudgetStore } from "@/stores/budget-tracker/use-budget-store"
import { PageHeader, Card, EmptyState } from "@transformotion/ui-primitives"
import {
  LayoutDashboard,
  ArrowUpRight,
  Home as HomeIcon,
  ShoppingCart,
  Car,
  Coffee,
  Receipt,
} from "lucide-react"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
} from "recharts"
import {
  buildDashboardStats,
  buildSpendingByCategory,
  buildMonthlyTrend,
  buildBudgetVsActual,
  getRecentTransactions,
  latestMonth,
} from "@transformotion/budget-domain"
import type { Transaction } from "@transformotion/budget-domain"
import { getCategoryColor } from "../data/category-colors"

// Mock design-of-record colours (corporate palette): navy income, teal spending.
const INCOME_COLOR = "#23476B"
const SPENDING_COLOR = "#2F9E8F"

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

function formatMonthLabel(monthKey: string): string {
  const [year, month] = monthKey.split("-")
  return new Date(parseInt(year), parseInt(month) - 1, 1).toLocaleDateString("en-AU", {
    month: "long",
    year: "numeric",
  })
}

function formatDateShort(dateStr: string): string {
  const [day, month, year] = dateStr.split("/").map(Number)
  if (!day || !month || !year) return dateStr
  return new Date(year, month - 1, day).toLocaleDateString("en-AU", { day: "numeric", month: "short" })
}

function iconForTransaction(tx: Transaction) {
  const key = `${tx.category ?? ""} ${tx.subcategory ?? ""} ${tx.description}`.toLowerCase()
  if (parseFloat(tx.amount) > 0) return ArrowUpRight
  if (/mortgage|rent|home|util|housing/.test(key)) return HomeIcon
  if (/grocer|supermarket|food/.test(key)) return ShoppingCart
  if (/fuel|petrol|car|transport|shell|bp/.test(key)) return Car
  if (/coffee|cafe|costa|starbucks|eating|entertain/.test(key)) return Coffee
  return Receipt
}

function StatTile({
  label,
  value,
  sub,
  subClassName,
  onClick,
}: {
  label: string
  value: React.ReactNode
  sub: string
  subClassName?: string
  onClick: () => void
}) {
  return (
    <Card interactive onClick={onClick}>
      <p className="font-display text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{label}</p>
      <p className="text-2xl font-bold text-foreground">{value}</p>
      <p className={subClassName ?? "text-xs text-muted-foreground mt-1"}>{sub}</p>
    </Card>
  )
}

export function HomeTab() {
  const transactions = useBudgetStore((s) => s.transactions)
  const budgetData = useBudgetStore((s) => s.budgetData)
  const insight = useBudgetStore((s) => s.dashboardInsight)
  const setActiveTab = useBudgetStore((s) => s.setActiveTab)

  const month = useMemo(() => latestMonth(transactions) ?? undefined, [transactions])
  const stats = useMemo(
    () => buildDashboardStats(transactions, budgetData, month),
    [transactions, budgetData, month],
  )
  const trend = useMemo(
    () => buildMonthlyTrend(transactions, budgetData.categories).slice(-6),
    [transactions, budgetData],
  )
  const spendingByCategory = useMemo(
    () => buildSpendingByCategory(transactions, budgetData, month),
    [transactions, budgetData, month],
  )
  const recent = useMemo(() => getRecentTransactions(transactions, 5), [transactions])
  const budgetProgress = useMemo(
    () =>
      month
        ? buildBudgetVsActual(transactions, budgetData, month).categories
            .filter((c) => c.budget > 0)
            .sort((a, b) => b.budget - a.budget)
            .slice(0, 4)
        : [],
    [transactions, budgetData, month],
  )

  const hasData = transactions.length > 0
  const savings = stats.savings

  return (
    <div className="p-4 space-y-4">
      <PageHeader
        title="Budget Tracker"
        subtitle={month ? `${formatMonthLabel(month)} overview` : "Overview"}
        titleClassName="font-display text-xl uppercase tracking-wide"
      />

      {!hasData ? (
        <EmptyState
          icon={LayoutDashboard}
          title="No data yet"
          description="Import transactions to see your dashboard"
        />
      ) : (
        <>
          {/* Stat row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatTile
              label="Monthly Income"
              value={formatCurrency(stats.monthlyIncome)}
              sub={month ? formatMonthLabel(month) : ""}
              subClassName="text-xs text-brand-teal mt-1"
              onClick={() => setActiveTab("cashflow")}
            />
            <StatTile
              label="Spent So Far"
              value={formatCurrency(stats.spentSoFar)}
              sub={`${Math.round(stats.spentFractionOfBudget * 100)}% of budget`}
              subClassName="text-xs text-brand-teal mt-1"
              onClick={() => setActiveTab("budget")}
            />
            <StatTile
              label="Remaining"
              value={formatCurrency(stats.remaining)}
              sub={stats.underBudget ? "Under budget" : "Over budget"}
              subClassName={stats.underBudget ? "text-xs text-brand-teal mt-1" : "text-xs text-signal-red mt-1"}
              onClick={() => setActiveTab("budget")}
            />
            <StatTile
              label="Savings Goal"
              value={
                savings.configured ? (
                  <>
                    {formatCurrency(savings.savedAmount)}{" "}
                    <span className="text-lg text-muted-foreground">/ {formatCurrency(savings.targetAmount)}</span>
                  </>
                ) : (
                  <span className="text-lg text-muted-foreground">Not set</span>
                )
              }
              sub={savings.configured ? `${Math.round(savings.fraction * 100)}% complete` : "Set a goal in Budget"}
              subClassName="text-xs text-signal-amber mt-1"
              onClick={() => setActiveTab("budget")}
            />
          </div>

          {/* Charts row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card interactive onClick={() => setActiveTab("cashflow")}>
              <h3 className="font-display text-sm font-semibold tracking-wide text-foreground">Income vs Spending</h3>
              <p className="text-xs text-muted-foreground mb-4">Last six months</p>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={trend} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
                    <YAxis
                      tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v: number) => `$${Math.round(v / 1000)}k`}
                    />
                    <Tooltip
                      formatter={(v: number, name: string) => [formatCurrency(v), name === "income" ? "Income" : "Spending"]}
                      contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                    />
                    <Bar dataKey="income" name="Income" fill={INCOME_COLOR} radius={[3, 3, 0, 0]} maxBarSize={22} />
                    <Bar dataKey="expenses" name="Spending" fill={SPENDING_COLOR} radius={[3, 3, 0, 0]} maxBarSize={22} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card interactive onClick={() => setActiveTab("summary")}>
              <h3 className="font-display text-sm font-semibold tracking-wide text-foreground">Spending by Category</h3>
              <p className="text-xs text-muted-foreground mb-4">This month</p>
              {spendingByCategory.length === 0 ? (
                <p className="text-xs text-muted-foreground py-8 text-center">No spending recorded this month</p>
              ) : (
                <div className="flex flex-col sm:flex-row items-center gap-4">
                  <div className="h-48 w-48 shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={spendingByCategory} dataKey="amount" nameKey="category" innerRadius={52} outerRadius={80} paddingAngle={2}>
                          {spendingByCategory.map((slice) => (
                            <Cell key={slice.categoryId} fill={getCategoryColor(slice.category)} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v: number, n: string) => [formatCurrency(v), n]} contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-2 flex-1 w-full">
                    {spendingByCategory.slice(0, 6).map((slice) => (
                      <div key={slice.categoryId} className="flex items-center justify-between gap-2 min-w-0">
                        <span className="flex items-center gap-2 min-w-0">
                          <span className="size-2.5 rounded-full shrink-0" style={{ backgroundColor: getCategoryColor(slice.category) }} />
                          <span className="text-xs text-muted-foreground truncate">{slice.category}</span>
                        </span>
                        <span className="text-xs font-medium text-foreground shrink-0">{formatCurrency(slice.amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          </div>

          {/* Lists row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card interactive onClick={() => setActiveTab("transactions")}>
              <h3 className="font-display text-sm font-semibold tracking-wide text-foreground mb-3">Recent Transactions</h3>
              <div className="divide-y divide-border">
                {recent.map((tx) => {
                  const Icon = iconForTransaction(tx)
                  const amount = parseFloat(tx.amount) || 0
                  const isIncome = amount > 0
                  return (
                    <div key={tx.transactionId} className="flex items-center gap-3 py-2.5">
                      <span className="grid place-items-center size-9 rounded-lg bg-surface2 text-muted-foreground shrink-0">
                        <Icon className="size-4" />
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-medium text-foreground truncate">{tx.description}</span>
                        <span className="block text-xs text-muted-foreground truncate">
                          {(tx.category || "Uncategorised")} · {formatDateShort(tx.date)}
                        </span>
                      </span>
                      <span className={isIncome ? "text-sm font-semibold text-brand-teal shrink-0" : "text-sm font-semibold text-foreground shrink-0"}>
                        {isIncome ? "+" : "-"}
                        {formatCurrency(Math.abs(amount))}
                      </span>
                    </div>
                  )
                })}
              </div>
            </Card>

            <Card interactive onClick={() => setActiveTab("budget")}>
              <h3 className="font-display text-sm font-semibold tracking-wide text-foreground mb-3">Budget Progress</h3>
              <div className="space-y-3">
                {budgetProgress.map((cat) => {
                  const pct = cat.budget > 0 ? Math.min((cat.actual / cat.budget) * 100, 100) : 0
                  const over = cat.actual > cat.budget
                  return (
                    <div key={cat.categoryId}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-foreground">{cat.category}</span>
                        <span className="text-xs text-muted-foreground">
                          {formatCurrency(cat.actual)} / {formatCurrency(cat.budget)}
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-surface2 overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${pct}%`, backgroundColor: over ? "var(--signal-red)" : INCOME_COLOR }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>

              {insight?.text && (
                // AI insight is informational and NOT a click-through target — swallow
                // the click so it doesn't navigate with the surrounding card.
                <div
                  className="mt-4 flex items-start gap-2 rounded-lg bg-surface2 p-3"
                  onClick={(e) => e.stopPropagation()}
                >
                  <span className="grid place-items-center size-6 rounded-full bg-brand-teal/10 text-brand-teal shrink-0">
                    <ArrowUpRight className="size-3.5" />
                  </span>
                  <p className="text-xs text-muted-foreground">
                    {insight.text}
                    {insight.stale && <span className="ml-1 text-[10px] uppercase tracking-wide text-signal-amber">· stale</span>}
                  </p>
                </div>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
