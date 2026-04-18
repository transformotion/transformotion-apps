"use client"

import { useState, useMemo } from "react"
import { useBudgetNavigation } from "../app-shell"
import { PageHeader, Card, EmptyState, PillSelector } from "@/components/ui/design-system"
import { BarChart3 } from "lucide-react"
import { CATEGORY_LIST } from "../data/categories"
import { CATEGORY_COLORS } from "../data/category-colors"
import { isProjectCategory, isProjectSubcategory, isProjectTransaction } from "../data/project-config"
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

// Parse date string to Date object
function parseDate(dateStr: string): Date {
  const [day, month, year] = dateStr.split("/").map(Number)
  return new Date(year, month - 1, day)
}

// Get month key for grouping
function getMonthKey(dateStr: string): string {
  const date = parseDate(dateStr)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
}

// Format month key to short label
function formatMonthShort(monthKey: string): string {
  const [year, month] = monthKey.split("-")
  const date = new Date(parseInt(year), parseInt(month) - 1)
  return date.toLocaleDateString("en-AU", { month: "short" })
}

// Format month key to full label
function formatMonthFull(monthKey: string): string {
  const [year, month] = monthKey.split("-")
  const date = new Date(parseInt(year), parseInt(month) - 1)
  return date.toLocaleDateString("en-AU", { month: "long", year: "numeric" })
}

// Format currency for chart
function formatCurrency(amount: number): string {
  if (amount >= 1000) {
    return `$${(amount / 1000).toFixed(1)}k`
  }
  return `$${amount.toFixed(0)}`
}

// Format currency full
function formatCurrencyFull(amount: number): string {
  return new Intl.NumberFormat("en-AU", { 
    style: "currency", 
    currency: "AUD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount)
}

export function CashflowTab() {
  const { transactions } = useBudgetNavigation()
  const [timeRange, setTimeRange] = useState<TimeRange>("6M")

  // Calculate monthly data
  const monthlyData = useMemo(() => {
    const byMonth: Record<string, { 
      income: number
      expenses: number
      net: number
      byCategory: Record<string, number>
      projectSpend: number
    }> = {}
    
    // Process transactions (excluding business, transfers, and ignored)
    for (const tx of transactions) {
      if (tx._business || tx.subcategory === "Transfer" || tx.category === "Ignore") continue
      
      const monthKey = getMonthKey(tx.date)
      if (!byMonth[monthKey]) {
        byMonth[monthKey] = { 
          income: 0, 
          expenses: 0, 
          net: 0, 
          byCategory: {},
          projectSpend: 0
        }
      }
      
      const amount = parseFloat(tx.amount) || 0
      
      if (isProjectTransaction(tx.category, tx.subcategory)) {
        byMonth[monthKey].projectSpend += Math.abs(amount)
      } else if (tx.category === "Income") {
        byMonth[monthKey].income += Math.abs(amount)
      } else if (tx.category) {
        byMonth[monthKey].expenses += Math.abs(amount)
        if (!byMonth[monthKey].byCategory[tx.category]) {
          byMonth[monthKey].byCategory[tx.category] = 0
        }
        byMonth[monthKey].byCategory[tx.category] += Math.abs(amount)
      }
    }
    
    // Calculate net for each month
    for (const data of Object.values(byMonth)) {
      data.net = data.income - data.expenses
    }
    
    return byMonth
  }, [transactions])

  // Get sorted month keys
  const allMonths = useMemo(() => {
    return Object.keys(monthlyData).sort()
  }, [monthlyData])

  // Filter months by time range
  const filteredMonths = useMemo(() => {
    const now = new Date()
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
    
    let monthsToShow: number
    switch (timeRange) {
      case "3M": monthsToShow = 3; break
      case "6M": monthsToShow = 6; break
      case "12M": monthsToShow = 12; break
      default: return allMonths
    }
    
    // Get last N months from available data
    return allMonths.slice(-monthsToShow)
  }, [allMonths, timeRange])

  // Prepare chart data
  const trendData = useMemo(() => {
    return filteredMonths.map(month => ({
      month: formatMonthShort(month),
      monthKey: month,
      income: monthlyData[month]?.income || 0,
      expenses: monthlyData[month]?.expenses || 0,
      net: monthlyData[month]?.net || 0
    }))
  }, [filteredMonths, monthlyData])

  // Prepare stacked bar data by category
  const categoryData = useMemo(() => {
    return filteredMonths.map(month => {
      const data: Record<string, unknown> = {
        month: formatMonthShort(month),
        monthKey: month
      }
      
      const monthData = monthlyData[month]
      if (monthData) {
        for (const cat of CATEGORY_LIST) {
          if (cat !== "Income" && !isProjectCategory(cat)) {
            data[cat] = monthData.byCategory[cat] || 0
          }
        }
      }
      
      return data
    })
  }, [filteredMonths, monthlyData])

  // Project spend cumulative data
  const projectData = useMemo(() => {
    let cumulative = 0
    return filteredMonths.map(month => {
      cumulative += monthlyData[month]?.projectSpend || 0
      return {
        month: formatMonthShort(month),
        monthKey: month,
        spend: monthlyData[month]?.projectSpend || 0,
        cumulative
      }
    })
  }, [filteredMonths, monthlyData])

  // Calculate summary stats
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
      if (net > bestNet) {
        bestNet = net
        bestMonth = month
      }
      if (net < worstNet) {
        worstNet = net
        worstMonth = month
      }
    }
    
    return { avgIncome, avgExpenses, bestMonth, bestNet, worstMonth, worstNet }
  }, [filteredMonths, monthlyData])

  const hasTransactions = transactions.length > 0

  // Get categories with spending for legend
  const activeCategories = useMemo(() => {
    const cats = new Set<string>()
    for (const month of filteredMonths) {
      const data = monthlyData[month]
      if (data) {
        for (const cat of Object.keys(data.byCategory)) {
          if (data.byCategory[cat] > 0) {
            cats.add(cat)
          }
        }
      }
    }
    return Array.from(cats).sort()
  }, [filteredMonths, monthlyData])

  // Sankey diagram data - flow from income sources to categories to subcategories
  const sankeyData = useMemo(() => {
    // Aggregate all transactions for the filtered period
    const incomeBySource: Record<string, number> = {}
    const expensesByCategory: Record<string, number> = {}
    const expensesBySubcategory: Record<string, { amount: number; category: string }> = {}
    
    for (const tx of transactions) {
      if (tx._business || tx.subcategory === "Transfer" || tx.category === "Ignore") continue
      
      const monthKey = getMonthKey(tx.date)
      if (!filteredMonths.includes(monthKey)) continue
      
      const amount = Math.abs(parseFloat(tx.amount) || 0)
      
      if (tx.category === "Income" && tx.subcategory) {
        incomeBySource[tx.subcategory] = (incomeBySource[tx.subcategory] || 0) + amount
      } else if (tx.category && !isProjectCategory(tx.category)) {
        expensesByCategory[tx.category] = (expensesByCategory[tx.category] || 0) + amount
        if (tx.subcategory) {
          if (!expensesBySubcategory[tx.subcategory]) {
            expensesBySubcategory[tx.subcategory] = { amount: 0, category: tx.category }
          }
          expensesBySubcategory[tx.subcategory].amount += amount
        }
      }
    }
    
    // Build nodes array: income sources, "Total Income", expense categories, top subcategories
    const nodes: Array<{ name: string }> = []
    const nodeIndex: Record<string, number> = {}
    
    // Add income sources
    const incomeSources = Object.entries(incomeBySource)
      .filter(([_, v]) => v > 100)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
    
    incomeSources.forEach(([name]) => {
      nodeIndex[`income-${name}`] = nodes.length
      nodes.push({ name })
    })
    
    // Add "Total Income" node
    nodeIndex["total-income"] = nodes.length
    nodes.push({ name: "Total Income" })
    
    // Add expense categories
    const categories = Object.entries(expensesByCategory)
      .filter(([_, v]) => v > 100)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
    
    categories.forEach(([name]) => {
      nodeIndex[`cat-${name}`] = nodes.length
      nodes.push({ name })
    })
    
    // Add top subcategories per category
    const topSubcategories = Object.entries(expensesBySubcategory)
      .filter(([_, v]) => v.amount > 50)
      .sort((a, b) => b[1].amount - a[1].amount)
      .slice(0, 12)
    
    topSubcategories.forEach(([name]) => {
      nodeIndex[`sub-${name}`] = nodes.length
      nodes.push({ name })
    })
    
    // Build links array
    const links: Array<{ source: number; target: number; value: number }> = []
    
    // Income sources → Total Income
    incomeSources.forEach(([name, value]) => {
      links.push({
        source: nodeIndex[`income-${name}`],
        target: nodeIndex["total-income"],
        value
      })
    })
    
    // Total Income → Expense Categories
    const totalIncome = Object.values(incomeBySource).reduce((s, v) => s + v, 0)
    categories.forEach(([name, value]) => {
      links.push({
        source: nodeIndex["total-income"],
        target: nodeIndex[`cat-${name}`],
        value
      })
    })
    
    // Expense Categories → Subcategories
    topSubcategories.forEach(([subName, { amount, category }]) => {
      if (nodeIndex[`cat-${category}`] !== undefined) {
        links.push({
          source: nodeIndex[`cat-${category}`],
          target: nodeIndex[`sub-${subName}`],
          value: amount
        })
      }
    })
    
    return { nodes, links, hasData: nodes.length > 2 && links.length > 0 }
  }, [transactions, filteredMonths])

  // Custom tooltip for trend chart
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
      {/* Header */}
      <PageHeader
        title="Cashflow"
        subtitle="Visualize your income and spending trends"
      />

      {/* Time Range Selector */}
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
          {/* Key Metrics */}
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

          {/* Sankey Diagram - Money Flow */}
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

          {/* Income vs Expenses Trend Chart */}
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

          {/* Category Breakdown Stacked Bar Chart */}
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
              
              {/* Legend for categories */}
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

          {/* Project Spend Chart */}
          {projectData.some(d => d.cumulative > 0) && (
            <Card className="border-signal-amber/30">
              <h3 className="text-sm font-semibold text-signal-amber mb-4">Project Spend Over Time</h3>
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={projectData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
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

          {/* Savings Rate Over Time */}
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
