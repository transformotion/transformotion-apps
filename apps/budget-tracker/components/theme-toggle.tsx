'use client'

import * as React from 'react'
import { Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { cn } from '@/lib/utils'

export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  const isLight = resolvedTheme === 'light'
  const next = isLight ? 'dark' : 'light'

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={mounted ? `Switch to ${next} theme` : 'Toggle theme'}
      title={mounted ? `Switch to ${next} theme` : 'Toggle theme'}
      className={cn(
        'inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs font-medium text-card-foreground transition-colors hover:bg-muted',
        className,
      )}
    >
      {mounted && isLight ? (
        <Moon className="size-4" aria-hidden="true" />
      ) : (
        <Sun className="size-4" aria-hidden="true" />
      )}
      <span>{mounted ? (isLight ? 'Dark' : 'Light') : 'Theme'}</span>
    </button>
  )
}
