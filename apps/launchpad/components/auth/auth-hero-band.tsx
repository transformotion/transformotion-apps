'use client'

import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { BrandLogo } from '@/components/brand/brand-logo'
import { cn } from '@/lib/utils'

export function AuthHeroBand({
  title,
  subtitle,
}: {
  title: string
  subtitle: string
}) {
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  const isDark = mounted && resolvedTheme === 'dark'

  return (
    <div
      className={cn(
        'transition-colors',
        isDark
          ? 'bg-slate-50 text-brand-navy'
          : 'bg-brand-navy text-brand-navy-foreground',
      )}
    >
      <div className="mx-auto max-w-lg px-4 pt-10 pb-14 text-center md:pt-12 md:pb-16">
        <div className="flex justify-center">
          <BrandLogo surface="contrast" priority imgClassName="h-16 w-auto sm:h-20" />
        </div>
        <h1
          className={cn(
            'mt-7 mb-1.5 font-display text-3xl font-semibold uppercase tracking-wide text-balance md:mt-9 md:text-4xl',
            isDark ? 'text-brand-navy' : 'text-brand-navy-foreground',
          )}
        >
          {title}
        </h1>
        <p
          className={cn(
            'text-pretty',
            isDark ? 'text-brand-navy/70' : 'text-brand-navy-foreground/70',
          )}
        >
          {subtitle}
        </p>
      </div>
    </div>
  )
}
