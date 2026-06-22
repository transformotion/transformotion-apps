'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { useTheme } from 'next-themes'

export function BudgetTrackerThemeScope({ children }: { children: ReactNode }) {
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  const themeClass = mounted && resolvedTheme === 'dark' ? 'theme-dark' : 'theme-light'

  return <div className={themeClass}>{children}</div>
}
