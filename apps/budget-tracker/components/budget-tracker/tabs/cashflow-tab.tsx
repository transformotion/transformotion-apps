"use client"

import { useState, useMemo } from "react"
import { useBudgetStore } from "@/stores/budget-tracker/use-budget-store"
import { PageHeader, Card, EmptyState, PillSelector } from "@/components/ui/design-system"
import { BarChart3 } from "lucide-react"
import { CATEGORY_COLORS } from "../data/category-colors"
import { getActiveCategories, getCategoryName, getSubcategoryName, isCapital, isTransfer } from "@/lib/categories"
import { cn } from "@/lib/utils"
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  CartesianGrid,
  Area,
  AreaChart,
  ComposedChart,
  Sankey,
  Layer,
  Rectangle
} from "recharts"

type TimeRange = "3M" | "6M" | "12M" | "All"

function parseDate(dateStr: string): Date {
  const [day, month, year] = dateStr.split("/").map(Number)
  return new Date(year, month - 1, day)
}

function getMonthKey(dateStr: string): string {
  const date = parseDate(dateStr)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
}

function formatMonthShort(monthKey: string): string {
  const [year, month] = monthKey.split("-")
  const date = new Date(parseInt(year), parseInt(month) - 1)
  return date.toLocaleDateString("en-AU", { month: "short" })
}

function formatMonthFull(monthKey: string): string {
  const [year, month] = monthKey.split("-")
  const date = new Date(parseInt(year), parseInt(month) - 1)
  return date.toLocaleDateString("en-AU", { month: "long", year: "numeric" })
}

function formatCurrency(amount: number): string {
  if (amount >= 1000) {
    return `$${(amount / 1000).toFixed(1)}k`
  }
  return `$${amount.toFixed(0)}`
}

function formatCurrencyFull(amount: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount)
}

export function CashflowTab() {
  const transactions = useBudgetStore((s) => s.transactions)
  const budgetData = useBudgetStore((s) => s.budgetData)
  const categories = budgetData.categories
  const [timeRange, setTimeRange] = useState<TimeRange>("6M")

  // Expense category names (non-income, non-capital) for stacked bar chart
  const expenseCategoryNames = useMemo(
    () => getActiveCategories(categories).filter(c => c.name !== 'Income' && c.type !== 'capital').map(c => c.name),
    [categories]
  )

  // Calculate monthly data
  const monthlyData = useMemo(() => {
    const byMonth: Record<string, {
      income: number
      expenses: number
      net: number
      byCategory: Record<string, number>
      capitalSpend: number
    }> = {}

    for (const tx of transactions) {
      const txIsTransfer = isTransfer(categories, tx.subcategoryId ?? null) || tx.subcategory === 'Transfer'
      if (tx._business || txIsTransfer || tx._ignore) continue

      const monthKey = getMonthKey(tx.date)
      if (!byMonth[monthKey]) {
        byMonth[monthKey] = {
          income: 0,
          expenses: 0,
          net: 0,
          byCategory: {},
          capitalSpend: 0
        }
      }

      const amount = parseFloat(tx.amount) || 0
      const catName = getCategoryName(categories, tx.categoryId ?? null) || tx.category || ''

      if (isCapital(categories, tx.categoryId ?? null)) {
        byMonth[monthKey].capitalSpend += Math.abs(amount)
      } else if (catName === 'Income') {
        byMonth[monthKey].income += Math.abs(amount)
      } else if (catName) {
        byMonth[monthKey].expenses += Math.abs(amount)
        byMonth[monthKey].byCategory[catName] = (byMonth[monthKey].byCategory[catName] || 0) + Math.abs(amount)
      }
    }

    for (const data of Object.values(byMonth)) {
      data.net = data.income - data.expenses
    }

    return byMonth
  }, [transactions, categories])

  const allMonths = useMemo(() => Object.keys(monthlyData).sort(), [monthlyData])

  const filteredMonths = useMemo(() => {
    let monthsToShow: number
    switch (timeRange) {
      case "3M": monthsToShow = 3; break
      case "6M": monthsToShow = 6; break
      case "12M": monthsToShow = 12; break
      default: return allMonths
    }
    return allMonths.slice(-monthsToShow)
  }, [allMonths, timeRange])

  const trendData = useMemo(() => {
    return filteredMonths.map(month => ({
      month: formatMonthShort(month),
      monthKey: month,
      income: monthlyData[month]?.income || 0,
      expenses: monthlyData[month]?.expenses || 0,
      net: monthlyData[month]?.net || 0
    }))
  }, [filteredMonths, monthlyData])

  const categoryData = useMemo(() => {
    return filteredMonths.map(month => {
      const data: Record<string, unknown> = {
        month: formatMonthShort(month),
        monthKey: month
      }
      const monthData = monthlyData[month]
      if (monthData) {
        for (const catName of expenseCategoryNames) {
          data[catName] = monthData.byCategory[catName] || 0
        }
      }
      return data
    })
  }, [filteredMonths, monthlyData, expenseCategoryNames])

  const capitalData = useMemo(() => {
    let cumulative = 0
    return filteredMonths.map(month => {
      cumulative += monthlyData[month]?.capitalSpend || 0
      return {
        month: formatMonthShort(month),
        monthKey: month,
        spend: monthlyData[month]?.capitalSpend || 0,
        cumulative
      }
    })
  }, [filteredMonths, monthlyData])

  const stats = useMemo(() => {
    const months = filteredMonths.map(m => monthlyData[m]).filter(Boolean)
    if (months.length === 0) return null

    const avgIncome = months.reduce((s, m) => s + m.income, 0) / months.length
    const avgExpenses = months.reduce((s, m) => s + m.expenses, 0) / months.length

    let bestMonth = filteredMonths[0]
    let worstMonth = filteredMonths[0]
    let bestNet = monthlyData[bestMonth]?.net || 0
    let worstNet = monthlyData[worstMonth]?.net || 0

    for (const month of filteredMonths) {
      const net = monthlyData[month]?.net || 0
      if (net > bestNet) { bestNet = net; bestMonth = month }
      if (net < worstNet) { worstNet = net; worstMonth = month }
    }

    return { avgIncome, avgExpenses, bestMonth, bestNet, worstMonth, worstNet }
  }, [filteredMonths, monthlyData])

  const hasTransactions = transactions.length > 0

  const activeCategories = useMemo(() => {
    const cats = new Set<string>()
    for (const month of filteredMonths) {
      const data = monthlyData[month]
      if (data) {
        for (const cat of Object.keys(data.byCategory)) {
          if (data.byCategory[cat] > 0) cats.add(cat)
        }
      }
    }
    return Array.from(cats).sort()
  }, [filteredMonths, monthlyData])

  const sankeyData = useMemo(() => {
    const incomeBySource: Record<string, number> = {}
    const expensesByCategory: Record<string, number> = {}
    const expensesBySubcategory: Record<string, { amount: number; category: string }> = {}

    for (const tx of transactions) {
      const txIsTransfer = isTransfer(categories, tx.subcategoryId ?? null) || tx.subcategory === 'Transfer'
      if (tx._business || txIsTransfer || tx._ignore) continue

      const monthKey = getMonthKey(tx.date)
      if (!filteredMonths.includes(monthKey)) continue

      const amount = Math.abs(parseFloat(tx.amount) || 0)
      const catName = getCategoryName(categories, tx.categoryId ?? null) || tx.category || ''
      const subName = getSubcategoryName(categories, tx.subcategoryId ?? null) || tx.subcategory || ''

      if (catName === 'Income' && subName) {
        incomeBySource[subName] = (incomeBySource[subName] || 0) + amount
      } else if (catName && !isCapital(categories, tx.categoryId ?? null)) {
        expensesByCategory[catName] = (expensesByCategory[catName] || 0) + amount
        if (subName) {
          if (!expensesBySubcategory[subName]) {
            expensesBySubcategory[subName] = { amount: 0, category: catName }
          }
          expensesBySubcategory[subName].amount += amount
        }
      }
    }

    const nodes: Array<{ name: string }> = []
    const nodeIndex: Record<string, number> = {}

    const incomeSources = Object.entries(incomeBySource)
      .filter(([_, v]) => v > 100)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)

    incomeSources.forEach(([name]) => {
      nodeIndex[`income-${name}`] = nodes.length
      nodes.push({ name })
    })

    nodeIndex["total-income"] = nodes.length
    nodes.push({ name: "Total Income" })

    const expCats = Object.entries(expensesByCategory)
      .filter(([_, v]) => v > 100)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)

    expCats.forEach(([name]) => {
      nodeIndex[`cat-${name}`] = nodes.length
      nodes.push({ name })
    })

    const topSubcategories = Object.entries(expensesBySubcategory)
      .filter(([_, v]) => v.amount > 50)
      .sort((a, b) => b[1].amount - a[1].amount)
      .slice(0, 12)

    topSubcategories.forEach(([name]) => {
      nodeIndex[`sub-${name}`] = nodes.length
      nodes.push({ name })
    })

    const links: Array<{ source: number; target: number; value: number }> = []

    incomeSources.forEach(([name, value]) => {
      links.push({ source: nodeIndex[`income-${name}`], target: nodeIndex["total-income"], value })
    })

    expCats.forEach(([name, value]) => {
      links.push({ source: nodeIndex["total-income"], target: nodeIndex[`cat-${name}`], value })
    })

    topSubcategories.forEach(([subName, { amount, category }]) => {
      if (nodeIndex[`cat-${category}`] !== undefined) {
        links.push({ source: nodeIndex[`cat-${category}`], target: nodeIndex[`sub-${subName}`], value: amount })
      }
    })

    return { nodes, links, hasData: nodes.length > 2 && links.length > 0 }
  }, [transactions, filteredMonths, categories])

  const TrendTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{name: string; value: number; color: string}>; label?: string }) => {
    if (!active || !payload) return null
    const monthKey = trendData.find(d => d.month === label)?.monthKey || ""

    return (
      <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
        <p className="text-sm font-medium text-foreground mb-2">{formatMonthFull(monthKey)}</p>
        {payload.map((entry, i) => (
          <div key={i} className="flex items-center justify-between gap-4 text-xs">
            <span className="text-muted-foreground capitalize">{entry.name}</span>
            <span style={{ color: entry.color }} className="font-medium">
              {formatCurrencyFull(entry.value)}
            </span>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="p-4 space-y-4">
      <PageHeader
        title="Cashflow"
        subtitle="Visualize your income and spending trends"
      />

      <PillSelector
        options={["3M", "6M", "12M", "All"] as TimeRange[]}
        value={timeRange}
        onChange={setTimeRange}
      />

      {!hasTransactions ? (
        <EmptyState
          icon={BarChart3}
          title="No data yet"
          description="Import transactions to see your cashflow charts"
        />
      ) : (
        <>
          {stats && (
            <div className="grid grid-cols-2 gap-3">
              <Card>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Avg Monthly Income</p>
                <p className="text-lg font-bold text-signal-green">{formatCurrencyFull(stats.avgIncome)}</p>
              </Card>
              <Card>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Avg Monthly Expenses</p>
                <p className="text-lg font-bold text-signal-red">{formatCurrencyFull(stats.avgExpenses)}</p>
              </Card>
              <Card>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Best Savings</p>
                <p className="text-sm font-medium text-foreground">{formatMonthFull(stats.bestMonth)}</p>
                <p className={cn("text-xs", stats.bestNet >= 0 ? "text-signal-green" : "text-signal-red")}>
                  {stats.bestNet >= 0 ? "+" : ""}{formatCurrencyFull(stats.bestNet)}
                </p>
              </Card>
              <Card>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Lowest Savings</p>
                <p className="text-sm font-medium text-foreground">{formatMonthFull(stats.worstMonth)}</p>
                <p className={cn("text-xs", stats.worstNet >= 0 ? "text-signal-green" : "text-signal-red")}>
                  {stats.worstNet >= 0 ? "+" : ""}{formatCurrencyFull(stats.worstNet)}
                </p>
              </Card>
            </div>
          )}

          {sankeyData.hasData && (
            <Card>
              <h3 className="text-sm font-semibold text-foreground mb-4">Money Flow</h3>
              <p className="text-xs text-muted-foreground mb-4">
                How your income flows through expense categories
              </p>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <Sankey
                    data={sankeyData}
                    node={({ x, y, width, height, index, payload }) => (
                      <Layer key={`node-${index}`}>
                        <Rectangle
                          x={x}
                          y={y}
                          width={width}
                          height={height}
                          fill={
                            payload.name === "Total Income"
                              ? "var(--signal-green)"
                              : index < 5
                                ? "var(--signal-green)"
                                : CATEGORY_COLORS[payload.name] || "var(--primary)"
                          }
                          fillOpacity={0.9}
                        />
                        <text
                          x={x < 200 ? x + width + 6 : x - 6}
                          y={y + height / 2}
                          textAnchor={x < 200 ? "start" : "end"}
                          dominantBaseline="middle"
                          style={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                        >
                          {payload.name}
                        </text>
                      </Layer>
                    )}
                    link={{
                      stroke: "var(--border)",
                      strokeOpacity: 0.5,
                    }}
                    margin={{ top: 10, right: 120, bottom: 10, left: 0 }}
                    nodeWidth={10}
                    nodePadding={14}
                  />
                </ResponsiveContainer>
              </div>
            </Card>
          )}

          <Card>
            <h3 className="text-sm font-semibold text-foreground mb-4">Income vs Expenses Trend</h3>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={trendData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    axisLine={{ stroke: "var(--border)" }}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={formatCurrency}
                    tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<TrendTooltip />} />
                  <Legend
                    wrapperStyle={{ fontSize: 11 }}
                    iconType="circle"
                    iconSize={8}
                  />
                  <Bar
                    dataKey="income"
                    name="Income"
                    fill="var(--signal-green)"
                    radius={[4, 4, 0, 0]}
                    barSize={24}
                  />
                  <Bar
                    dataKey="expenses"
                    name="Expenses"
                    fill="var(--signal-red)"
                    radius={[4, 4, 0, 0]}
                    barSize={24}
                  />
                  <Line
                    type="monotone"
                    dataKey="net"
                    name="Net Savings"
                    stroke="var(--primary)"
                    strokeWidth={2}
                    dot={{ fill: "var(--primary)", r: 3 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {activeCategories.length > 0 && (
            <Card>
              <h3 className="text-sm font-semibold text-foreground mb-4">Monthly Expenses by Category</h3>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={categoryData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis
                      dataKey="month"
                      tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                      axisLine={{ stroke: "var(--border)" }}
                      tickLine={false}
                    />
                    <YAxis
                      tickFormatter={formatCurrency}
                      tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "var(--card)",
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                        fontSize: 11
                      }}
                      formatter={(value: number) => formatCurrencyFull(value)}
                    />
                    {activeCategories.map(cat => (
                      <Bar
                        key={cat}
                        dataKey={cat}
                        stackId="a"
                        fill={CATEGORY_COLORS[cat] || CATEGORY_COLORS["default"]}
                        name={cat}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-border">
                {activeCategories.map(cat => (
                  <div key={cat} className="flex items-center gap-1.5">
                    <div
                      className="size-2.5 rounded-full"
                      style={{ backgroundColor: CATEGORY_COLORS[cat] || CATEGORY_COLORS["default"] }}
                    />
                    <span className="text-[10px] text-muted-foreground">{cat}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {capitalData.some(d => d.cumulative > 0) && (
            <Card className="border-signal-amber/30">
              <h3 className="text-sm font-semibold text-signal-amber mb-4">Capital Spend Over Time</h3>
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={capitalData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis
                      dataKey="month"
                      tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                      axisLine={{ stroke: "var(--border)" }}
                      tickLine={false}
                    />
                    <YAxis
                      tickFormatter={formatCurrency}
                      tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "var(--card)",
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                        fontSize: 11
                      }}
                      formatter={(value: number) => formatCurrencyFull(value)}
                    />
                    <Area
                      type="monotone"
                      dataKey="cumulative"
                      name="Cumulative Spend"
                      stroke="var(--signal-amber)"
                      fill="var(--signal-amber)"
                      fillOpacity={0.2}
                      strokeWidth={2}
                    />
                    <Area
                      type="monotone"
                      dataKey="spend"
                      name="Monthly Spend"
                      stroke="var(--signal-amber)"
                      fill="var(--signal-amber)"
                      fillOpacity={0.4}
                      strokeWidth={1}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Card>
          )}

          <Card>
            <h3 className="text-sm font-semibold text-foreground mb-4">Savings Rate Trend</h3>
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={trendData.map(d => ({
                    ...d,
                    savingsRate: d.income > 0 ? ((d.income - d.expenses) / d.income) * 100 : 0
                  }))}
                  margin={{ top: 5, right: 5, left: -20, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    axisLine={{ stroke: "var(--border)" }}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={(v) => `${v.toFixed(0)}%`}
                    tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                    axisLine={false}
                    tickLine={false}
                    domain={[-50, 50]}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "var(--card)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      fontSize: 11
                    }}
                    formatter={(value: number) => `${value.toFixed(1)}%`}
                  />
                  <Line
                    type="monotone"
                    dataKey="savingsRate"
                    name="Savings Rate"
                    stroke="var(--primary)"
                    strokeWidth={2}
                    dot={{ fill: "var(--primary)", r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </>
      )}
    </div>
  )
}
