import type { ComponentType, ReactNode } from 'react'
import { cn } from '@/lib/utils'

// M11 — design-system primitives ported VERBATIM from v0
// (transformotion-apps-b8/components/ui/design-system.tsx) so the live M11 admin
// surfaces are pixel-faithful to v0. Same structure, classes, and tokens; the
// shared tokens (bg-card/border-border/bg-surface2/signal-*/primary) already
// exist in the live app's Tailwind theme.

// Card Container — consistent card styling. Uses a div (role="button" when
// interactive) to avoid nested-button issues.
export function Card({
  id,
  children,
  interactive = false,
  className,
  onClick,
  animationDelay,
}: {
  id?: string
  children: ReactNode
  interactive?: boolean
  className?: string
  onClick?: () => void
  animationDelay?: number
}) {
  return (
    <div
      id={id}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      } : undefined}
      className={cn(
        'p-4 bg-card border border-border rounded-xl transition-all text-left w-full',
        interactive && 'hover:border-primary/30 hover:bg-card/80 active:scale-[0.99] cursor-pointer',
        animationDelay !== undefined && 'animate-in fade-in slide-in-from-bottom-2',
        className,
      )}
      style={animationDelay !== undefined ? { animationDelay: `${animationDelay}ms` } : undefined}
    >
      {children}
    </div>
  )
}

// Empty State — consistent empty-state display.
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
        'flex items-center justify-center gap-2 h-11 px-4 rounded-xl font-medium transition-all',
        'bg-primary text-primary-foreground hover:bg-primary/90',
        'disabled:opacity-70 disabled:cursor-not-allowed',
        className,
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
        'flex items-center justify-center gap-2 h-11 px-4 rounded-xl font-medium transition-all',
        'bg-surface2 text-muted-foreground hover:text-foreground border border-border',
        'disabled:opacity-70 disabled:cursor-not-allowed',
        className,
      )}
    >
      {Icon && <Icon className="size-4" />}
      {children}
    </button>
  )
}
