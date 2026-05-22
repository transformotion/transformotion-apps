"use client"

/**
 * TRANSFORMOTION DESIGN SYSTEM
 * ============================
 * Unified design tokens and components for visual consistency across all screens.
 * 
 * SPACING RHYTHM
 * - xs: 4px (gap-1)
 * - sm: 8px (gap-2, p-2)
 * - md: 12px (gap-3, p-3)
 * - lg: 16px (gap-4, p-4)
 * - xl: 20px (gap-5, p-5)
 * - 2xl: 24px (gap-6, p-6)
 * 
 * TYPOGRAPHY SCALE
 * - text-[10px]: Labels, badges, metadata (uppercase tracking-wider)
 * - text-xs: Secondary text, hints, small labels
 * - text-sm: Body text, card content, form labels
 * - text-base: Section headers, card titles
 * - text-lg: Page titles
 * - text-xl: Large numbers, prices
 * - text-2xl: Hero numbers
 * - text-3xl: Featured prices
 * 
 * CARD STYLES
 * - Standard: p-4 bg-card border border-border rounded-xl
 * - Interactive: + hover:border-primary/30 hover:bg-card/80 active:scale-[0.99]
 * - Elevated: + shadow-lg shadow-black/5
 * 
 * BUTTON STYLES
 * - Primary: bg-primary text-primary-foreground rounded-xl h-11
 * - Secondary: bg-surface2 text-muted-foreground border border-border rounded-xl h-11
 * - Ghost: text-muted-foreground hover:text-foreground rounded-lg
 * - Icon: size-9 or size-10 rounded-lg bg-surface2
 */

import { cn } from "./lib/utils"
import { 
  TrendingUp, 
  TrendingDown, 
  Minus, 
  Eye,
  EyeOff,
  AlertTriangle,
  Sparkles,
} from "lucide-react"
import { useState, useEffect, type ReactNode, type ComponentType } from "react"
import { createPortal } from "react-dom"

// ============================================================================
// TYPES
// ============================================================================

export type Signal = "ENTER" | "EXIT" | "HOLD" | "WATCH"
export type Verdict = "BUY" | "HOLD" | "SELL" | "NEUTRAL"
export type TrendSignal = "BULL" | "NEUTRAL" | "BEAR"
export type CycleStage = "early" | "mid" | "late" | "peak"
export type AlertType = "accumulate" | "late-stage" | "sell" | null

// ============================================================================
// CONFIG OBJECTS
// ============================================================================

export const signalConfig: Record<Signal, { 
  color: string
  bg: string
  bgLight: string
  border: string
  icon: ComponentType<{ className?: string }>
}> = {
  ENTER: { color: "text-signal-green", bg: "bg-signal-green", bgLight: "bg-signal-green/15", border: "border-signal-green", icon: TrendingUp },
  EXIT: { color: "text-signal-red", bg: "bg-signal-red", bgLight: "bg-signal-red/15", border: "border-signal-red", icon: TrendingDown },
  HOLD: { color: "text-signal-amber", bg: "bg-signal-amber", bgLight: "bg-signal-amber/15", border: "border-signal-amber", icon: Minus },
  WATCH: { color: "text-muted-foreground", bg: "bg-muted-foreground", bgLight: "bg-muted/50", border: "border-muted-foreground", icon: Eye },
}

export const verdictConfig: Record<Verdict, {
  color: string
  bg: string
  bgLight: string
}> = {
  BUY: { color: "text-signal-green", bg: "bg-signal-green", bgLight: "bg-signal-green/15" },
  HOLD: { color: "text-signal-amber", bg: "bg-signal-amber", bgLight: "bg-signal-amber/15" },
  SELL: { color: "text-signal-red", bg: "bg-signal-red", bgLight: "bg-signal-red/15" },
  NEUTRAL: { color: "text-muted-foreground", bg: "bg-muted-foreground", bgLight: "bg-muted/50" },
}

export const trendSignalConfig: Record<TrendSignal, {
  color: string
  bg: string
  icon: ComponentType<{ className?: string }>
  label: string
}> = {
  BULL: { color: "text-signal-green", bg: "bg-signal-green/15", icon: TrendingUp, label: "Bullish" },
  NEUTRAL: { color: "text-signal-amber", bg: "bg-signal-amber/15", icon: Minus, label: "Neutral" },
  BEAR: { color: "text-signal-red", bg: "bg-signal-red/15", icon: TrendingDown, label: "Bearish" },
}

export const cycleStageConfig: Record<CycleStage, {
  color: string
  label: string
  textColor: string
}> = {
  early: { color: "bg-signal-green", label: "Early move", textColor: "text-signal-green" },
  mid: { color: "bg-signal-amber", label: "Mid trend", textColor: "text-signal-amber" },
  late: { color: "bg-signal-gold", label: "Late stage", textColor: "text-signal-gold" },
  peak: { color: "bg-signal-red", label: "Peak", textColor: "text-signal-red" },
}

export const alertConfig: Record<Exclude<AlertType, null>, {
  bg: string
  text: string
  border: string
  icon: ComponentType<{ className?: string }>
  label: string
}> = {
  accumulate: { 
    bg: "bg-signal-green/15", 
    text: "text-signal-green", 
    border: "border-signal-green/30",
    icon: Sparkles, 
    label: "Accumulation opportunity" 
  },
  "late-stage": { 
    bg: "bg-signal-amber/15", 
    text: "text-signal-amber", 
    border: "border-signal-amber/30",
    icon: AlertTriangle, 
    label: "Late stage - monitor" 
  },
  sell: { 
    bg: "bg-signal-red/15", 
    text: "text-signal-red", 
    border: "border-signal-red/30",
    icon: TrendingDown, 
    label: "Consider selling"
  },
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

export function getAlert(cyclePosition: number, signal: Verdict | Signal): AlertType {
  const isBuySignal = signal === "BUY" || signal === "ENTER"
  if (cyclePosition < 40 && isBuySignal) return "accumulate"
  if (cyclePosition >= 65 && cyclePosition < 80) return "late-stage"
  if (cyclePosition >= 80) return "sell"
  return null
}

export function formatPrice(price: number, currency: string = "AUD"): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(price)
}

export function formatChange(change: number, showSign: boolean = true): string {
  const sign = showSign && change > 0 ? "+" : ""
  return `${sign}${change.toFixed(2)}%`
}

// ============================================================================
// SHARED COMPONENTS
// ============================================================================

// Page Header - consistent across all tabs
export function PageHeader({ 
  title, 
  subtitle,
  action,
}: { 
  title: string
  subtitle: string
  action?: ReactNode
}) {
  return (
    <div className="flex items-start justify-between">
      <div>
        <h1 className="text-lg font-semibold text-foreground">{title}</h1>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
      {action}
    </div>
  )
}

// Segmented Control - Geography/Market selector style
export function SegmentedControl<T extends string>({ 
  options, 
  value, 
  onChange,
  className,
}: { 
  options: T[]
  value: T
  onChange: (value: T) => void
  className?: string
}) {
  return (
    <div className={cn("flex gap-1 p-1 bg-card rounded-lg", className)}>
      {options.map((option) => (
        <button
          key={option}
          onClick={() => onChange(option)}
          className={cn(
            "flex-1 px-3 py-2 rounded-md text-sm font-medium transition-all",
            value === option
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {option}
        </button>
      ))}
    </div>
  )
}

// Pill Selector - Horizontal scrollable pills
export function PillSelector<T extends string>({ 
  options, 
  value, 
  onChange,
  renderLabel,
}: { 
  options: T[]
  value: T
  onChange: (value: T) => void
  renderLabel?: (option: T) => ReactNode
}) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 md:mx-0 md:px-0">
      {options.map((option) => (
        <button
          key={option}
          onClick={() => onChange(option)}
          className={cn(
            "px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all shrink-0",
            value === option
              ? "bg-primary/15 text-primary border border-primary/30"
              : "bg-card text-muted-foreground border border-border hover:border-primary/30"
          )}
        >
          {renderLabel ? renderLabel(option) : option}
        </button>
      ))}
    </div>
  )
}

// Cycle Gauge - Full width cycle position indicator
export function CycleGauge({ 
  position, 
  stage,
  showLabels = true,
  size = "md",
}: { 
  position: number
  stage: CycleStage
  showLabels?: boolean
  size?: "sm" | "md"
}) {
  const config = cycleStageConfig[stage]
  const height = size === "sm" ? "h-1" : "h-1.5"
  const indicatorSize = size === "sm" ? "w-1" : "w-1.5"
  
  return (
    <div className="w-full">
      {showLabels && (
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] text-muted-foreground">{config.label}</span>
          <span className="text-[10px] font-medium text-foreground">{position}%</span>
        </div>
      )}
      <div className={cn("bg-surface2 rounded-full overflow-hidden relative", height)}>
        <div className="absolute inset-0 flex">
          <div className="w-1/4 bg-signal-green/30" />
          <div className="w-1/4 bg-signal-amber/30" />
          <div className="w-1/4 bg-signal-gold/30" />
          <div className="w-1/4 bg-signal-red/30" />
        </div>
        <div 
          className={cn("absolute top-0 bottom-0 rounded-full", indicatorSize, config.color)}
          style={{ left: `${position}%`, transform: 'translateX(-50%)' }}
        />
      </div>
      {showLabels && size === "md" && (
        <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
          <span>Early</span>
          <span>Mid</span>
          <span>Late</span>
          <span>Peak</span>
        </div>
      )}
    </div>
  )
}

// Signal Badge - Colored signal indicator
export function SignalBadge({ signal }: { signal: Signal }) {
  const config = signalConfig[signal]
  const Icon = config.icon
  
  return (
    <div className={cn(
      "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold",
      config.bgLight,
      config.color
    )}>
      <Icon className="size-3.5" />
      {signal}
    </div>
  )
}

// Verdict Badge - BUY/HOLD/SELL indicator
export function VerdictBadge({ verdict, size = "md" }: { verdict: Verdict, size?: "sm" | "md" }) {
  const config = verdictConfig[verdict]
  
  return (
    <div className={cn(
      "rounded-md font-semibold",
      config.bgLight,
      config.color,
      size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs"
    )}>
      {verdict}
    </div>
  )
}

// Alert Badge - Contextual alert indicator
export function AlertBadge({ type, value }: { type: AlertType, value?: number }) {
  if (!type) return null
  
  const config = alertConfig[type]
  const Icon = config.icon
  const label = value && type === "sell" 
    ? `Consider selling - est. $${value.toLocaleString('en-AU', { maximumFractionDigits: 0 })} net`
    : config.label
  
  return (
    <div className={cn(
      "flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-medium border",
      config.bg,
      config.text,
      config.border
    )}>
      <Icon className="size-3" />
      {label}
    </div>
  )
}

// Trend Signal Badge - BULL/NEUTRAL/BEAR
export function TrendBadge({ trend }: { trend: TrendSignal }) {
  const config = trendSignalConfig[trend]
  const Icon = config.icon
  
  return (
    <div className={cn(
      "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold",
      config.bg,
      config.color
    )}>
      <Icon className="size-3.5" />
      {config.label}
    </div>
  )
}

// Price Display - Consistent price formatting with change
export function PriceDisplay({ 
  price, 
  change,
  size = "md",
}: { 
  price: number
  change?: number
  size?: "sm" | "md" | "lg"
}) {
  const priceClass = {
    sm: "text-sm",
    md: "text-xl",
    lg: "text-3xl",
  }[size]
  
  const changeClass = {
    sm: "text-[10px]",
    md: "text-sm",
    lg: "text-base",
  }[size]
  
  return (
    <div className="flex items-baseline gap-2">
      <span className={cn("font-semibold text-foreground", priceClass)}>
        ${price.toFixed(2)}
      </span>
      {change !== undefined && (
        <span className={cn(
          "font-medium",
          changeClass,
          change > 0 ? "text-signal-green" : change < 0 ? "text-signal-red" : "text-muted-foreground"
        )}>
          {change > 0 ? "+" : ""}{change.toFixed(2)}%
        </span>
      )}
    </div>
  )
}

// Stock Icon - Ticker abbreviation in a box
export function StockIcon({ 
  ticker, 
  size = "md" 
}: { 
  ticker: string
  size?: "sm" | "md" | "lg"
}) {
  const sizeClass = {
    sm: "size-8 text-xs",
    md: "size-10 text-sm",
    lg: "size-12 text-lg",
  }[size]
  
  const abbrev = ticker.split('.')[0].slice(0, 3)
  
  return (
    <div className={cn(
      "rounded-lg bg-surface2 flex items-center justify-center shrink-0",
      sizeClass
    )}>
      <span className="font-bold text-foreground">{abbrev}</span>
    </div>
  )
}

// Card Container - Consistent card styling
// Uses div with role="button" to avoid nested button issues when interactive
export function Card({ 
  children, 
  interactive = false,
  className,
  onClick,
  animationDelay,
}: { 
  children: ReactNode
  interactive?: boolean
  className?: string
  onClick?: () => void
  animationDelay?: number
}) {
  return (
    <div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      } : undefined}
      className={cn(
        "p-4 bg-card border border-border rounded-xl transition-all text-left w-full",
        interactive && "hover:border-primary/30 hover:bg-card/80 active:scale-[0.99] cursor-pointer",
        animationDelay !== undefined && "animate-in fade-in slide-in-from-bottom-2",
        className
      )}
      style={animationDelay !== undefined ? { animationDelay: `${animationDelay}ms` } : undefined}
    >
      {children}
    </div>
  )
}

// Stat Box - Small stat display
export function StatBox({ 
  label, 
  value, 
  change,
  className,
}: { 
  label: string
  value: string
  change?: number
  className?: string
}) {
  return (
    <div className={cn("p-2.5 bg-surface2 rounded-lg", className)}>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">{label}</p>
      <div className="flex items-baseline gap-1">
        <span className="text-sm font-semibold text-foreground">{value}</span>
        {change !== undefined && (
          <span className={cn(
            "text-[10px] font-medium",
            change > 0 ? "text-signal-green" : change < 0 ? "text-signal-red" : "text-muted-foreground"
          )}>
            {change > 0 ? "+" : ""}{change}%
          </span>
        )}
      </div>
    </div>
  )
}

// Section Header - Consistent section titles
export function SectionHeader({ 
  title,
  action,
}: { 
  title: string
  action?: ReactNode
}) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h2>
      {action}
    </div>
  )
}

// Empty State - Consistent empty state display
export function EmptyState({ 
  icon: Icon,
  title,
  description,
  action,
}: { 
  icon: ComponentType<{ className?: string }>
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-6">
      <div className="size-16 rounded-2xl bg-card border border-border flex items-center justify-center mb-4">
        <Icon className="size-7 text-muted-foreground" />
      </div>
      <h3 className="text-base font-medium text-foreground mb-1">{title}</h3>
      <p className="text-sm text-muted-foreground text-center max-w-[280px] mb-4">
        {description}
      </p>
      {action}
    </div>
  )
}

// Text Visibility Toggle
export function TextToggle({
  visible,
  onToggle,
  isOverride = false,
  size = "sm",
}: {
  visible: boolean
  onToggle: () => void
  isOverride?: boolean // true if this tab's value differs from global setting
  size?: "sm" | "md"
}) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onToggle() }}
      className={cn(
        "flex items-center gap-1.5 rounded-lg border transition-colors",
        size === "sm" ? "px-2 py-1 text-[10px]" : "px-2.5 py-1.5 text-xs",
        visible 
          ? "bg-primary/10 border-primary/30 text-primary hover:bg-primary/15" 
          : "bg-surface2 border-border text-muted-foreground hover:text-foreground hover:bg-surface2/80"
      )}
      title={visible ? "Hide analysis text" : "Show analysis text"}
    >
      {visible ? (
        <Eye className={size === "sm" ? "size-3" : "size-3.5"} />
      ) : (
        <EyeOff className={size === "sm" ? "size-3" : "size-3.5"} />
      )}
      <span className="font-medium">Text</span>
      {isOverride && (
        <span className="size-1.5 rounded-full bg-signal-amber" title="Tab override active" />
      )}
    </button>
  )
}

// Primary Button
export function PrimaryButton({ 
  children,
  onClick,
  disabled,
  loading,
  icon: Icon,
  className,
}: { 
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
  loading?: boolean
  icon?: ComponentType<{ className?: string }>
  className?: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={cn(
        "flex items-center justify-center gap-2 h-11 px-4 rounded-xl font-medium transition-all",
        "bg-primary text-primary-foreground hover:bg-primary/90",
        "disabled:opacity-70 disabled:cursor-not-allowed",
        className
      )}
    >
      {Icon && <Icon className="size-4" />}
      {children}
    </button>
  )
}

// Secondary Button
export function SecondaryButton({ 
  children,
  onClick,
  disabled,
  icon: Icon,
  className,
}: { 
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
  icon?: ComponentType<{ className?: string }>
  className?: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex items-center justify-center gap-2 h-11 px-4 rounded-xl font-medium transition-all",
        "bg-surface2 text-muted-foreground hover:text-foreground border border-border",
        "disabled:opacity-70 disabled:cursor-not-allowed",
        className
      )}
    >
      {Icon && <Icon className="size-4" />}
      {children}
    </button>
  )
}

// Icon Button
export function IconButton({ 
  icon: Icon,
  onClick,
  variant = "default",
  size = "md",
  className,
}: { 
  icon: ComponentType<{ className?: string }>
  onClick?: (e: React.MouseEvent) => void
  variant?: "default" | "destructive"
  size?: "sm" | "md"
  className?: string
}) {
  const sizeClass = size === "sm" ? "size-8" : "size-9"
  const iconSize = size === "sm" ? "size-3.5" : "size-4"
  
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation() // Prevent triggering parent card onClick
    onClick?.(e)
  }
  
  return (
    <button
      onClick={handleClick}
      className={cn(
        "flex items-center justify-center rounded-lg transition-all",
        sizeClass,
        variant === "destructive" 
          ? "bg-surface2 text-muted-foreground hover:text-signal-red hover:bg-signal-red/10"
          : "bg-surface2 text-muted-foreground hover:text-foreground",
        className
      )}
    >
      <Icon className={iconSize} />
    </button>
  )
}

// Back Link - Breadcrumb-style back navigation
export function BackLink({ 
  label,
  onClick,
}: { 
  label: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
    >
      <span>←</span>
      <span>{label}</span>
    </button>
  )
}

// ============================================================================
// CACHE STATUS BAR
// ============================================================================

export type CacheFreshness = "fresh" | "recent" | "stale" | "outdated"

const freshnessConfig: Record<CacheFreshness, { color: string; bg: string; label: string }> = {
  fresh: { color: "text-signal-green", bg: "bg-signal-green/15", label: "Fresh" },
  recent: { color: "text-signal-amber", bg: "bg-signal-amber/15", label: "Recent" },
  stale: { color: "text-signal-gold", bg: "bg-signal-gold/15", label: "Stale" },
  outdated: { color: "text-signal-red", bg: "bg-signal-red/15", label: "Outdated" },
}

export function CacheStatusBar({
  freshness,
  lastUpdated,
  isLive,
  onRefresh,
  onToggleMode,
}: {
  freshness: CacheFreshness
  lastUpdated: string
  isLive: boolean
  onRefresh: () => void
  onToggleMode: () => void
}) {
  const config = freshnessConfig[freshness]
  
  return (
    <div className="flex items-center justify-between py-2 px-3 bg-card rounded-lg border border-border">
      <div className="flex items-center gap-3">
        {/* Freshness Badge */}
        <span className={cn("px-2 py-0.5 rounded text-[10px] font-semibold uppercase", config.bg, config.color)}>
          {config.label}
        </span>
        {/* Age */}
        <span className="text-xs text-muted-foreground">{lastUpdated}</span>
      </div>
      <div className="flex items-center gap-2">
        {/* Mode Toggle */}
        <button
          onClick={onToggleMode}
          className={cn(
            "flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-medium transition-all",
            isLive ? "bg-signal-green/15 text-signal-green" : "bg-signal-gold/15 text-signal-gold"
          )}
        >
          <span className={cn("size-1.5 rounded-full", isLive ? "bg-signal-green animate-pulse" : "bg-signal-gold")} />
          {isLive ? "Live" : "Fast"}
        </button>
        {/* Refresh */}
        <button
          onClick={onRefresh}
          className="flex items-center gap-1 px-2 py-1 rounded text-xs text-muted-foreground hover:text-primary transition-colors"
        >
          <svg className="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 12a9 9 0 11-3-6.7M21 4v4h-4" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Refresh
        </button>
      </div>
    </div>
  )
}

// ============================================================================
// MODE TOGGLE (Fast/Live) - for use before search
// ============================================================================

export function ModeToggle({
  isLive,
  onToggle,
  cacheAge = "45 minutes ago",
  freshness = "recent",
}: {
  isLive: boolean
  onToggle: () => void
  cacheAge?: string
  freshness?: "fresh" | "recent" | "stale" | "outdated"
}) {
  const freshnessConfig = {
    fresh: { color: "text-signal-green", label: "Fresh" },
    recent: { color: "text-signal-gold", label: "Recent" },
    stale: { color: "text-signal-amber", label: "Stale" },
    outdated: { color: "text-signal-red", label: "Outdated" },
  }
  const config = freshnessConfig[freshness]
  
  return (
    <div className="flex items-center justify-between py-2 px-4 bg-card rounded-lg border border-border">
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-muted-foreground">Cached</span>
        <span className={cn("text-xs font-medium", config.color)}>
          {cacheAge}
        </span>
      </div>
      <button
        onClick={onToggle}
        className={cn(
          "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
          isLive ? "bg-signal-green/15 text-signal-green" : "bg-signal-gold/15 text-signal-gold"
        )}
      >
        <span className={cn("size-1.5 rounded-full", isLive ? "bg-signal-green animate-pulse" : "bg-signal-gold")} />
        {isLive ? "Live" : "Fast"}
      </button>
    </div>
  )
}

// ============================================================================
// FULL CYCLE GAUGE WITH SCORE
// ============================================================================

export function FullCycleGauge({
  score,
  stage,
  rsiDivergence,
  macdMomentum,
  volumeTrend,
  summary,
}: {
  score: number
  stage: CycleStage
  rsiDivergence: "none" | "bullish" | "bearish"
  macdMomentum: "strengthening" | "weakening" | "flat"
  volumeTrend: "confirming" | "diverging" | "neutral"
  summary: string
}) {
  const config = cycleStageConfig[stage]
  
  // Helper for indicator colors
  const getIndicatorStyle = (value: string, positive: string[], negative: string[]) => {
    if (positive.includes(value)) return "bg-signal-green/15 text-signal-green border-signal-green/30"
    if (negative.includes(value)) return "bg-signal-red/15 text-signal-red border-signal-red/30"
    return "bg-surface2 text-muted-foreground border-border"
  }
  
  return (
    <div className="space-y-4">
      {/* Score Display */}
      <div className="text-center">
        <div className="text-4xl font-bold text-foreground mb-1">{score} <span className="text-lg text-muted-foreground">/ 100</span></div>
        <div className={cn("text-sm font-medium", config.textColor)}>{config.label}</div>
      </div>
      
      {/* Gauge Bar */}
      <div className="relative">
        <div className="h-3 bg-surface2 rounded-full overflow-hidden flex">
          <div className="w-[35%] bg-signal-green/40" />
          <div className="w-[25%] bg-signal-amber/40" />
          <div className="w-[20%] bg-signal-gold/40" />
          <div className="w-[20%] bg-signal-red/40" />
        </div>
        {/* Position marker */}
        <div 
          className="absolute top-1/2 -translate-y-1/2 size-4 rounded-full bg-foreground border-2 border-background shadow-lg"
          style={{ left: `${score}%`, transform: 'translate(-50%, -50%)' }}
        />
        {/* Labels */}
        <div className="flex justify-between text-[10px] text-muted-foreground mt-2 px-1">
          <span>0</span>
          <span>Early (0-35)</span>
          <span>Mid (35-60)</span>
          <span>Late (60-80)</span>
          <span>Peak (80-100)</span>
        </div>
      </div>
      
      {/* Indicator Pills */}
      <div className="flex flex-wrap gap-2">
        <span className={cn("px-2.5 py-1 rounded-full text-xs font-medium border", getIndicatorStyle(rsiDivergence, ["bullish"], ["bearish"]))}>
          RSI: {rsiDivergence === "none" ? "None" : rsiDivergence}
        </span>
        <span className={cn("px-2.5 py-1 rounded-full text-xs font-medium border", getIndicatorStyle(macdMomentum, ["strengthening"], ["weakening"]))}>
          MACD: {macdMomentum}
        </span>
        <span className={cn("px-2.5 py-1 rounded-full text-xs font-medium border", getIndicatorStyle(volumeTrend, ["confirming"], ["diverging"]))}>
          Volume: {volumeTrend}
        </span>
      </div>
      
      {/* Summary */}
      <p className="text-sm text-muted-foreground italic">{summary}</p>
    </div>
  )
}

// ============================================================================
// CSV DROP ZONE
// ============================================================================

export function CSVDropZone({
  onFileSelect,
  isUploading,
}: {
  onFileSelect: (file: File) => void
  isUploading?: boolean
}) {
  const [isDragging, setIsDragging] = useState(false)
  
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file && file.name.endsWith('.csv')) {
      onFileSelect(file)
    }
  }
  
  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) onFileSelect(file)
  }
  
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      className={cn(
        "relative border-2 border-dashed rounded-xl p-6 text-center transition-all cursor-pointer",
        isDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50",
        isUploading && "pointer-events-none opacity-70"
      )}
    >
      <input
        type="file"
        accept=".csv"
        onChange={handleFileInput}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        disabled={isUploading}
      />
      <div className="size-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
        <svg className="size-6 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
      <p className="text-sm font-medium text-foreground mb-1">
        {isUploading ? "Uploading..." : "Drag your CMC Markets CSV here"}
      </p>
      <p className="text-xs text-muted-foreground">
        or tap to browse
      </p>
      <p className="text-[10px] text-muted-foreground mt-3">
        Export from CMC Markets → Profit & Loss → Download CSV
      </p>
    </div>
  )
}

// ============================================================================
// CSV PREVIEW TABLE
// ============================================================================

interface CSVPreviewRow {
  ticker: string
  shares: number
  avgCost: number
  totalCost: number
  gifted?: boolean
}

export function CSVPreviewTable({
  rows,
  onImport,
  onCancel,
}: {
  rows: CSVPreviewRow[]
  onImport: () => void
  onCancel: () => void
}) {
  return (
    <div className="space-y-4">
      <div className="border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-surface2">
              <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Ticker</th>
              <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground">Shares</th>
              <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground">Avg Cost</th>
              <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground">Cost Basis</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-t border-border">
                <td className="px-3 py-2 font-medium text-foreground">{row.ticker}</td>
                <td className="px-3 py-2 text-right text-muted-foreground">{row.shares}</td>
                <td className="px-3 py-2 text-right text-muted-foreground">
                  {row.gifted ? "—" : `$${row.avgCost.toFixed(2)}`}
                </td>
                <td className="px-3 py-2 text-right">
                  {row.gifted ? (
                    <span className="px-1.5 py-0.5 rounded bg-signal-green/15 text-[10px] font-medium text-signal-green">Gifted</span>
                  ) : (
                    `$${row.totalCost.toLocaleString('en-AU', { minimumFractionDigits: 2 })}`
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex gap-3">
        <SecondaryButton onClick={onCancel} className="flex-1">Cancel</SecondaryButton>
        <PrimaryButton onClick={onImport} className="flex-1">Import {rows.length} holdings</PrimaryButton>
      </div>
    </div>
  )
}

// ============================================================================
// CONFIRMATION MODAL
// ============================================================================

export function ConfirmationModal({
  isOpen,
  title,
  message,
  confirmLabel,
  cancelLabel,
  variant,
  onConfirm,
  onCancel,
}: {
  isOpen: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: "default" | "destructive"
  onConfirm: () => void
  onCancel: () => void
}) {
  const [mounted, setMounted] = useState(false)
  
  useEffect(() => {
    setMounted(true)
  }, [])
  
  if (!isOpen || !mounted) return null
  
  // Use portal to render at document body level, escaping any parent stacking contexts
  return createPortal(
    <>
      <div className="fixed inset-0 bg-black/50 z-[9999]" onClick={onCancel} />
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm mx-4 p-6 bg-card border border-border rounded-2xl shadow-2xl z-[9999]">
        <h3 className="text-lg font-semibold text-foreground mb-2">{title}</h3>
        <p className="text-sm text-muted-foreground mb-6">{message}</p>
        <div className="flex gap-3">
          <SecondaryButton onClick={onCancel} className="flex-1">
            {cancelLabel || "Cancel"}
          </SecondaryButton>
          <button
            onClick={onConfirm}
            className={cn(
              "flex-1 h-11 rounded-xl font-medium transition-all",
              variant === "destructive" 
                ? "bg-signal-red text-white hover:bg-signal-red/90"
                : "bg-primary text-primary-foreground hover:bg-primary/90"
            )}
          >
            {confirmLabel || "Confirm"}
          </button>
        </div>
      </div>
    </>,
    document.body
  )
}
