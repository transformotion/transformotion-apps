import { cn } from '@/lib/utils'

interface WordmarkProps {
  className?: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
}

/**
 * Transformotion Brand Wordmark
 * T — larger, white | RANSFOR — white | M — teal | O — gold | TION — teal
 */
export function Wordmark({ className, size = 'md' }: WordmarkProps) {
  const sizeClasses = {
    sm: 'text-lg',
    md: 'text-xl',
    lg: 'text-2xl',
    xl: 'text-3xl',
  }

  const tSizeClasses = {
    sm: 'text-xl',
    md: 'text-2xl',
    lg: 'text-3xl',
    xl: 'text-4xl',
  }

  return (
    <span
      className={cn(
        'font-brand tracking-[0.06em] uppercase inline-flex items-baseline',
        sizeClasses[size],
        className,
      )}
    >
      <span className={cn('text-foreground', tSizeClasses[size])}>T</span>
      <span className="text-foreground">RANSFOR</span>
      <span className="text-primary">M</span>
      <span className="text-signal-gold">O</span>
      <span className="text-primary">TION</span>
    </span>
  )
}

export function BrandMark({
  variant = 'initial',
  className,
}: {
  variant?: 'initial' | 'dot'
  className?: string
}) {
  if (variant === 'dot') {
    return <span className={cn('size-2 rounded-full bg-primary', className)} />
  }

  return (
    <span className={cn('font-brand text-xl tracking-[0.06em] text-primary', className)}>
      T
    </span>
  )
}
