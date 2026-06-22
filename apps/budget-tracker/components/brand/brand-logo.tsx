'use client'

import Image from 'next/image'
import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { transformotionLogoAssets } from '@transformotion/brand-tokens'
import { cn } from '@/lib/utils'

const LIGHT_MODE = {
  src: transformotionLogoAssets.transparent,
  width: 2272,
  height: 845,
}

const DARK_MODE = {
  src: transformotionLogoAssets.white,
  width: 1062,
  height: 274,
}

function budgetAssetPath(src: string): string {
  return `/budget-tracker${src}`
}

export function BrandLogo({
  className,
  imgClassName,
  priority,
  surface = 'band',
}: {
  className?: string
  imgClassName?: string
  priority?: boolean
  surface?: 'band' | 'navy' | 'contrast' | 'page'
}) {
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  const isDark = mounted && resolvedTheme === 'dark'

  if (surface === 'navy') {
    return (
      <span className={cn('inline-flex items-center', className)}>
        <Image
          src={budgetAssetPath(LIGHT_MODE.src)}
          alt="Transformotion"
          width={LIGHT_MODE.width}
          height={LIGHT_MODE.height}
          priority={priority}
          className={cn('h-7 w-auto', imgClassName)}
        />
      </span>
    )
  }

  if (surface === 'contrast') {
    const variant = isDark ? DARK_MODE : LIGHT_MODE
    return (
      <span className={cn('inline-flex items-center', className)}>
        <Image
          src={budgetAssetPath(variant.src)}
          alt="Transformotion"
          width={variant.width}
          height={variant.height}
          priority={priority}
          className={cn(
            'h-7 w-auto',
            isDark ? 'mix-blend-multiply' : 'scale-[1.44] origin-center',
            imgClassName,
          )}
        />
      </span>
    )
  }

  if (surface === 'page') {
    const variant = isDark ? LIGHT_MODE : DARK_MODE
    return (
      <span className={cn('inline-flex items-center', className)}>
        <Image
          src={budgetAssetPath(variant.src)}
          alt="Transformotion"
          width={variant.width}
          height={variant.height}
          priority={priority}
          className={cn(
            'h-7 w-auto',
            isDark ? 'scale-[1.44] origin-center' : 'mix-blend-multiply',
            imgClassName,
          )}
        />
      </span>
    )
  }

  const variant = isDark ? DARK_MODE : LIGHT_MODE

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md bg-brand-band px-2.5 py-1.5',
        className,
      )}
    >
      <Image
        src={budgetAssetPath(variant.src)}
        alt="Transformotion"
        width={variant.width}
        height={variant.height}
        priority={priority}
        className={cn('h-7 w-auto', imgClassName)}
      />
    </span>
  )
}
