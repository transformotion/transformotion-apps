"use client"

import { useMemo, useState } from "react"
import { useBudgetStore } from "@/stores/budget-tracker/use-budget-store"
import { useAuthStore, selectCurrentAccount } from "@/stores/auth/use-auth-store"
import { PageHeader, Card, PrimaryButton, SecondaryButton } from "@transformotion/ui-primitives"
import { PiggyBank, Plus, X, ArrowRight, AlertTriangle, Clock, CheckCircle2, Info } from "lucide-react"
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
} from "recharts"
import {
  buildSavingsGoalProgress,
  potBalance,
  potProjection,
  potMonthEndBalances,
  getSubcategoryMonthlyBudget,
  latestMonth,
} from "@transformotion/budget-domain"
import type { Category, Subcategory, Transaction } from "@transformotion/budget-domain"
import { getActiveCategories, getActiveSubcategories } from "@/lib/categories"
import { cn } from "@/lib/utils"

// Pot marker colours — same palette as the Budget-tab pot rows.
const POT_COLORS = ["#14b8a6", "#3b82f6", "#f59e0b", "#8b5cf6", "#ec4899"]

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

function formatSigned(amount: number): string {
  return `${amount < 0 ? "−" : "+"}${formatCurrency(Math.abs(amount))}`
}

// ── month helpers (YYYY-MM) ───────────────────────────────────────────────────
function monthKeyToIndex(ym: string): number {
  const [y, m] = ym.split("-").map(Number)
  return y * 12 + (m - 1)
}
function indexToMonthKey(i: number): string {
  const y = Math.floor(i / 12)
  const m = (i % 12) + 1
  return `${y}-${String(m).padStart(2, "0")}`
}
function enumerateMonthKeys(startIdx: number, endIdx: number): string[] {
  const out: string[] = []
  for (let i = startIdx; i <= endIdx; i++) out.push(indexToMonthKey(i))
  return out
}
function monthShort(ym: string): string {
  const [y, m] = ym.split("-").map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString("en-AU", { month: "short", year: "2-digit" })
}
function monthLong(ym: string): string {
  const [y, m] = ym.split("-").map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString("en-AU", { month: "short", year: "numeric" })
}
function txMonthKey(dateStr: string): string | null {
  const p = dateStr.split("/")
  return p.length === 3 ? `${p[2]}-${p[1].padStart(2, "0")}` : null
}
function currentMonthKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}
function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

interface PotView {
  sub: Subcategory
  cat: Category
  idx: number
  color: string
  balance: number
  contribution: number
  proj: ReturnType<typeof potProjection>
}

export function SavingsTab() {
  const transactions = useBudgetStore((s) => s.transactions)
  const budgetData = useBudgetStore((s) => s.budgetData)
  const setActiveTab = useBudgetStore((s) => s.setActiveTab)
  const addTransactions = useBudgetStore((s) => s.addTransactions)
  const currentAccount = useAuthStore(selectCurrentAccount)

  const month = useMemo(() => latestMonth(transactions) ?? currentMonthKey(), [transactions])

  const pots = useMemo<PotView[]>(() => {
    const savingsCats = getActiveCategories(budgetData.categories).filter((c) => c.role === "savings")
    return savingsCats.flatMap((cat) =>
      getActiveSubcategories(cat).map((sub) => ({ sub, cat })),
    ).map((p, idx) => ({
      ...p,
      idx,
      color: POT_COLORS[idx % POT_COLORS.length],
      balance: potBalance(p.sub, transactions),
      contribution: getSubcategoryMonthlyBudget(p.sub.subcategoryId, budgetData),
      proj: potProjection(p.sub, transactions, month),
    }))
  }, [budgetData, transactions, month])

  const goal = useMemo(
    () => buildSavingsGoalProgress(transactions, budgetData, month),
    [transactions, budgetData, month],
  )
  const totalAcrossPots = useMemo(() => pots.reduce((s, p) => s + p.balance, 0), [pots])

  // Trajectory chart data: solid history + dashed projection per pot.
  const chart = useMemo(() => {
    if (pots.length === 0) return { data: [] as Record<string, number | string>[], todayLabel: "" }
    const todayIdx = monthKeyToIndex(month)
    const potTxMonthIdxs = transactions
      .filter((t) => pots.some((p) => p.sub.subcategoryId === t.subcategoryId))
      .map((t) => txMonthKey(t.date))
      .filter((m): m is string => m !== null)
      .map(monthKeyToIndex)
    const startIdx = potTxMonthIdxs.length ? Math.min(...potTxMonthIdxs, todayIdx) : todayIdx - 6
    const deadlineIdxs = pots
      .map((p) => (p.sub.potDeadline ? monthKeyToIndex(p.sub.potDeadline) : null))
      .filter((x): x is number => x !== null)
    const endIdx = Math.max(todayIdx + 6, startIdx + 1, ...deadlineIdxs)

    const historyByPot = pots.map((p) => {
      const series = potMonthEndBalances(p.sub, transactions, indexToMonthKey(startIdx), month)
      return new Map(series.map((pt) => [pt.month, pt.balance]))
    })

    const data = enumerateMonthKeys(startIdx, endIdx).map((mk) => {
      const mi = monthKeyToIndex(mk)
      const row: Record<string, number | string> = { label: monthShort(mk) }
      pots.forEach((p, i) => {
        if (mi <= todayIdx) row[`a${i}`] = historyByPot[i].get(mk) ?? p.balance
        if (mi >= todayIdx) row[`p${i}`] = p.proj.currentBalance + p.proj.contributionRate * (mi - todayIdx)
      })
      return row
    })
    return { data, todayLabel: monthShort(month) }
  }, [pots, transactions, month])

  // ── Add movement modal ────────────────────────────────────────────────────
  const [movementPot, setMovementPot] = useState<string | null>(null) // subcategoryId; null = closed
  const [movementDir, setMovementDir] = useState<"in" | "out">("in")
  const [mvAmount, setMvAmount] = useState("")
  const [mvDate, setMvDate] = useState("")
  const [mvNote, setMvNote] = useState("")

  function openMovement(subcategoryId: string) {
    setMovementPot(subcategoryId)
    setMovementDir("in")
    setMvAmount("")
    setMvDate(todayISO())
    setMvNote("")
  }

  const selPot = pots.find((p) => p.sub.subcategoryId === movementPot)
  const mvMagnitude = Math.abs(parseFloat(mvAmount) || 0)
  const mvNewBalance = (selPot?.balance ?? 0) + (movementDir === "in" ? mvMagnitude : -mvMagnitude)

  function saveMovement() {
    if (!selPot || mvMagnitude <= 0 || !mvDate) return
    const signed = movementDir === "in" ? mvMagnitude : -mvMagnitude
    const [y, m, d] = mvDate.split("-")
    // A pot movement is a MANUAL transaction in the pot's subcategory, signed per
    // direction — the existing transaction mechanism, no new persistence.
    const tx: Transaction = {
      transactionId: crypto.randomUUID(),
      accountId: currentAccount?.id ?? "",
      date: `${d}/${m}/${y}`,
      amount: String(signed),
      description: mvNote.trim() || `${movementDir === "in" ? "Contribution" : "Withdrawal"} — ${selPot.sub.name}`,
      categoryId: selPot.cat.categoryId,
      subcategoryId: selPot.sub.subcategoryId,
      file: "manual",
      _manual: true,
      _business: false,
    }
    addTransactions([tx])
    setMovementPot(null)
  }

  // ── empty state ────────────────────────────────────────────────────────────
  if (pots.length === 0) {
    return (
      <div className="p-4 space-y-4">
        <PageHeader title="Savings" subtitle="Track your pots and progress to goal" titleClassName="font-display text-xl uppercase tracking-wide" />
        <Card>
          <div className="flex flex-col items-center text-center py-14 px-6">
            <span className="grid place-items-center size-16 rounded-2xl bg-signal-green/10 text-signal-green mb-4">
              <PiggyBank className="size-8" />
            </span>
            <p className="font-display text-lg font-bold text-foreground">No savings category configured yet</p>
            <p className="text-sm text-muted-foreground mt-2 max-w-md leading-relaxed">
              Give a budget category the{" "}
              <span className="font-medium text-foreground">Savings</span>{" "}
              role and name its subcategories as pots — they&apos;ll appear here with balances, targets and projections.
            </p>
            <PrimaryButton onClick={() => setActiveTab("budget")} className="mt-6">
              Go to Budget
              <ArrowRight className="size-4 ml-2" />
            </PrimaryButton>
          </div>
        </Card>
      </div>
    )
  }

  const goalTarget = goal.targetAmount
  const toGo = Math.max(goalTarget - goal.savedAmount, 0)
  const goalCaption =
    budgetData.savingsGoal?.mode === "derived" ? "Derived from your Savings budget" : "A monthly target you set"

  return (
    <div className="p-4 space-y-4">
      <PageHeader
        title="Savings"
        subtitle="Track your pots and progress to goal"
        titleClassName="font-display text-xl uppercase tracking-wide"
      />

      {/* (a) Header strip */}
      <div className="rounded-xl border border-signal-green/25 bg-signal-green/5 p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-0 sm:divide-x divide-signal-green/20">
        <div className="sm:pr-6">
          <p className="text-[10px] font-bold uppercase tracking-wider text-signal-green">Monthly savings goal</p>
          <p className="text-2xl font-extrabold text-foreground mt-1">
            {goal.configured ? formatCurrency(goalTarget) : "—"}
            {goal.configured && <span className="text-sm font-semibold text-muted-foreground">/mo</span>}
          </p>
          <p className="text-xs text-signal-green/90 mt-0.5">{goal.configured ? goalCaption : "No goal set"}</p>
        </div>
        <div className="sm:px-6">
          <p className="text-[10px] font-bold uppercase tracking-wider text-signal-green">Saved this month</p>
          <p className="text-2xl font-extrabold text-signal-green mt-1">{formatCurrency(goal.savedAmount)}</p>
          <p className="text-xs text-signal-green/90 mt-0.5">
            {goal.configured && goalTarget > 0
              ? `${Math.round(goal.fraction * 100)}% of goal · ${formatCurrency(toGo)} to go`
              : "No goal set"}
          </p>
        </div>
        <div className="sm:pl-6">
          <p className="text-[10px] font-bold uppercase tracking-wider text-signal-green">Total across all pots</p>
          <p className="text-2xl font-extrabold text-foreground mt-1">{formatCurrency(totalAcrossPots)}</p>
          <p className="text-xs text-signal-green/90 mt-0.5">
            {pots.length} active pot{pots.length === 1 ? "" : "s"}
          </p>
        </div>
      </div>

      {/* (b) Trajectory chart */}
      <Card>
        <div className="flex items-center justify-between gap-3 flex-wrap mb-1">
          <h3 className="font-display text-sm font-semibold tracking-wide text-foreground">Pot balances over time</h3>
          <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
            {pots.map((p) => (
              <span key={p.sub.subcategoryId} className="flex items-center gap-1.5">
                <span className="w-3.5 h-[3px] rounded" style={{ backgroundColor: p.color }} />
                {p.sub.name}
              </span>
            ))}
            <span className="flex items-center gap-1.5 text-muted-foreground/70">
              <span className="w-3.5 border-t-2 border-dashed border-current" />
              projection
            </span>
          </div>
        </div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chart.data} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
              <YAxis
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => `$${Math.round(v / 1000)}k`}
              />
              <Tooltip
                formatter={(v: number) => formatCurrency(v)}
                contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
              />
              <ReferenceLine x={chart.todayLabel} stroke="var(--muted-foreground)" strokeDasharray="2 3" label={{ value: "Today", position: "top", fontSize: 10, fill: "var(--muted-foreground)" }} />
              {pots.map((p, i) => (
                <Line key={`a${i}`} type="monotone" dataKey={`a${i}`} stroke={p.color} strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
              ))}
              {pots.map((p, i) => (
                <Line key={`p${i}`} type="monotone" dataKey={`p${i}`} stroke={p.color} strokeWidth={2} strokeDasharray="5 4" dot={false} connectNulls isAnimationActive={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="text-[11px] text-muted-foreground mt-2">
          Dashed = projection at the current contribution rate.
        </p>
      </Card>

      {/* (c) Pot cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {pots.map((p) => (
          <PotCard key={p.sub.subcategoryId} pot={p} transactions={transactions} onAddMovement={() => openMovement(p.sub.subcategoryId)} />
        ))}
      </div>

      {/* Add movement modal */}
      {selPot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
          <Card className="w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-lg font-semibold tracking-wide text-foreground">Add movement</h3>
              <button onClick={() => setMovementPot(null)} className="p-1 text-muted-foreground hover:text-foreground">
                <X className="size-5" />
              </button>
            </div>

            <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Pot</label>
            <select
              value={movementPot ?? ""}
              onChange={(e) => setMovementPot(e.target.value)}
              className="w-full h-10 px-3 mb-3.5 bg-card border border-border rounded-lg text-sm text-foreground"
            >
              {pots.map((p) => (
                <option key={p.sub.subcategoryId} value={p.sub.subcategoryId}>{p.sub.name}</option>
              ))}
            </select>

            <div className="flex gap-3 mb-3.5">
              <div className="flex-1">
                <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Date</label>
                <input
                  type="date"
                  value={mvDate}
                  onChange={(e) => setMvDate(e.target.value)}
                  className="w-full h-10 px-3 bg-card border border-border rounded-lg text-sm text-foreground"
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Amount</label>
                <div className="flex items-center h-10 px-3 bg-card border border-border rounded-lg">
                  <span className="text-muted-foreground font-bold">$</span>
                  <input
                    type="number"
                    value={mvAmount}
                    onChange={(e) => setMvAmount(e.target.value)}
                    placeholder="0.00"
                    autoFocus
                    className="w-full px-1 bg-transparent text-sm text-foreground outline-none"
                  />
                </div>
              </div>
            </div>

            <label className="block text-xs font-semibold text-muted-foreground mb-1.5">Direction</label>
            <div className="flex gap-2.5 mb-3.5">
              <button
                onClick={() => setMovementDir("in")}
                className={cn(
                  "flex-1 h-10 rounded-lg border text-sm font-semibold transition-colors",
                  movementDir === "in"
                    ? "border-signal-green bg-signal-green/10 text-signal-green"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                ↓ Contribution (in)
              </button>
              <button
                onClick={() => setMovementDir("out")}
                className={cn(
                  "flex-1 h-10 rounded-lg border text-sm font-semibold transition-colors",
                  movementDir === "out"
                    ? "border-signal-red bg-signal-red/10 text-signal-red"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                ↑ Withdrawal (out)
              </button>
            </div>

            <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
              Note <span className="font-normal text-muted-foreground/60">(optional)</span>
            </label>
            <input
              value={mvNote}
              onChange={(e) => setMvNote(e.target.value)}
              placeholder="e.g. Monthly standing order"
              className="w-full h-10 px-3 mb-4 bg-card border border-border rounded-lg text-sm text-foreground"
            />

            {/* live balance preview */}
            <div className="flex items-center justify-between bg-surface2 rounded-lg px-3.5 py-3">
              <span className="text-sm text-muted-foreground">{selPot.sub.name} balance</span>
              <span className="text-sm font-bold text-muted-foreground flex items-center gap-2">
                {formatCurrency(selPot.balance)}
                <span className="text-border">→</span>
                <span className={movementDir === "in" ? "text-signal-green" : "text-signal-red"}>
                  {formatCurrency(mvNewBalance)}
                </span>
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground flex items-center gap-1.5 mt-2 mb-4">
              <Info className="size-3" />
              Saved as a manual transaction in {selPot.cat.name} › {selPot.sub.name}
            </p>

            <div className="flex items-center gap-2.5 justify-end">
              <SecondaryButton onClick={() => setMovementPot(null)}>Cancel</SecondaryButton>
              <PrimaryButton onClick={saveMovement} disabled={mvMagnitude <= 0}>Add movement</PrimaryButton>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}

// ── Pot card ────────────────────────────────────────────────────────────────
function PotCard({
  pot,
  transactions,
  onAddMovement,
}: {
  pot: PotView
  transactions: Transaction[]
  onAddMovement: () => void
}) {
  const { sub, color, balance, contribution, proj } = pot
  const hasTarget = sub.potTarget != null
  const target = sub.potTarget ?? 0
  const remaining = target - balance
  const fraction = hasTarget && target > 0 ? Math.max(0, Math.min(balance / target, 1)) : 0

  // Status badge.
  const behind = !!sub.potDeadline && proj.monthsDelta != null && proj.monthsDelta < 0
  const status = !hasTarget
    ? { label: "Sinking fund", cls: "bg-surface2 text-muted-foreground" }
    : behind
      ? { label: "Behind pace", cls: "bg-signal-amber/15 text-signal-amber" }
      : { label: "On track", cls: "bg-primary/10 text-primary" }

  // Subtitle.
  const subtitle = !hasTarget
    ? "No target · fills & empties"
    : `Target ${formatCurrency(target)}` +
      (sub.potDeadline ? ` · by ${monthLong(sub.potDeadline)}` : " · no deadline") +
      (sub.potOpeningBalance != null ? ` · opening ${formatCurrency(sub.potOpeningBalance)}` : "")

  // In/out this calendar year (no-target pots).
  const year = String(new Date().getFullYear())
  const yearTx = transactions.filter(
    (t) => t.subcategoryId === sub.subcategoryId && txMonthKey(t.date)?.startsWith(year),
  )
  const inYear = yearTx.reduce((s, t) => { const a = parseFloat(t.amount) || 0; return a > 0 ? s + a : s }, 0)
  const outYear = yearTx.reduce((s, t) => { const a = parseFloat(t.amount) || 0; return a < 0 ? s + a : s }, 0)

  // Target-only pace: months to reach target at the current rate.
  const monthsToTarget = proj.contributionRate > 0 ? Math.ceil(remaining / proj.contributionRate) : null

  return (
    <Card className="flex flex-col">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 min-w-0">
          <span className="size-2.5 rounded-[3px] shrink-0" style={{ backgroundColor: color }} />
          <span className="font-semibold text-base text-foreground truncate">{sub.name}</span>
        </span>
        <span className={cn("text-[11px] font-bold px-2.5 py-0.5 rounded-full shrink-0", status.cls)}>{status.label}</span>
      </div>
      <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>

      <p className="text-3xl font-extrabold text-foreground mt-4">{formatCurrency(balance)}</p>
      <p className="text-xs text-muted-foreground mt-0.5">
        {hasTarget ? `${Math.round(fraction * 100)}% of ${formatCurrency(target)}` : "Current balance"}
      </p>
      {contribution > 0 && (
        <p className="text-[11px] text-muted-foreground mt-0.5">{formatCurrency(contribution)}/mo contribution</p>
      )}

      {/* progress bar where a target is set */}
      {hasTarget && (
        <div className="h-2 rounded-full bg-surface2 overflow-hidden mt-3.5">
          <div className="h-full rounded-full" style={{ width: `${fraction * 100}%`, backgroundColor: color }} />
        </div>
      )}

      {/* pace / warning line */}
      {!hasTarget ? (
        <div className="flex gap-2.5 mt-4">
          <div className="flex-1 rounded-lg bg-signal-green/10 px-3 py-2">
            <p className="text-[11px] font-semibold text-signal-green">In this year</p>
            <p className="text-sm font-extrabold text-signal-green mt-0.5">{formatSigned(inYear)}</p>
          </div>
          <div className="flex-1 rounded-lg bg-signal-red/10 px-3 py-2">
            <p className="text-[11px] font-semibold text-signal-red">Out this year</p>
            <p className="text-sm font-extrabold text-signal-red mt-0.5">{formatSigned(outYear)}</p>
          </div>
        </div>
      ) : behind ? (
        <div className="flex gap-2.5 items-start rounded-lg bg-signal-amber/10 border border-signal-amber/25 px-3 py-2.5 mt-3.5">
          <AlertTriangle className="size-4 text-signal-amber shrink-0 mt-0.5" />
          <p className="text-xs leading-relaxed text-signal-amber">
            {proj.requiredRate != null && <>Needs <b>{formatCurrency(proj.requiredRate)}/mo</b> to hit {monthLong(sub.potDeadline!)} — </>}
            you&apos;re budgeting <b>{formatCurrency(contribution)}/mo</b>{" "}
            <span className="text-signal-amber/80">(~{Math.abs(Math.round(proj.monthsDelta!))} month{Math.abs(Math.round(proj.monthsDelta!)) === 1 ? "" : "s"} late)</span>
          </p>
        </div>
      ) : sub.potDeadline ? (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-3">
          <CheckCircle2 className="size-3.5 text-primary" />
          {remaining <= 0
            ? "Target reached"
            : `On track for ${monthLong(sub.potDeadline)}${proj.monthsDelta != null && proj.monthsDelta > 0 ? ` · ~${Math.round(proj.monthsDelta)} months early` : ""}`}
        </div>
      ) : (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-3">
          <Clock className="size-3.5 text-primary" />
          {remaining <= 0 ? "Target reached" : monthsToTarget != null ? `~${monthsToTarget} months at current rate` : "No contributions yet"}
        </div>
      )}

      <button
        onClick={onAddMovement}
        className="mt-auto pt-4 w-full flex items-center justify-center gap-2 text-sm font-semibold text-primary hover:text-primary/80 transition-colors"
      >
        <Plus className="size-4" /> Add movement
      </button>
    </Card>
  )
}
