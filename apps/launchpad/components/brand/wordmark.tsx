import { cn } from '@/lib/utils'
import { BrandLogo } from '@/components/brand/brand-logo'

interface WordmarkProps {
  className?: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
}

export function Wordmark({ className, size = 'md' }: WordmarkProps) {
  const imageSizeClasses = {
    sm: 'h-5',
    md: 'h-6',
    lg: 'h-7',
    xl: 'h-10',
  }

  return <BrandLogo surface="page" className={className} imgClassName={imageSizeClasses[size]} />
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

  return <BrandLogo surface="page" className={className} imgClassName="h-6" />
}
