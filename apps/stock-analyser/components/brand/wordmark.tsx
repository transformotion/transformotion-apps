import { cn } from "@/lib/utils"
import { BrandLogo } from "./brand-logo"

interface WordmarkProps {
  className?: string
  size?: "sm" | "md" | "lg"
}

export function Wordmark({ className, size = "md" }: WordmarkProps) {
  const sizeClasses = {
    sm: "h-5",
    md: "h-7",
    lg: "h-9",
  }

  return (
    <BrandLogo
      surface="page"
      className={className}
      imgClassName={cn(sizeClasses[size])}
    />
  )
}

/**
 * Compact brand mark for mobile navigation
 * Uses a teal "T" initial or a small teal dot
 */
export function BrandMark({ variant = "initial", className }: { 
  variant?: "initial" | "dot"
  className?: string 
}) {
  if (variant === "dot") {
    return (
      <span className={cn("size-2 rounded-full bg-primary", className)} />
    )
  }

  return (
    <span className={cn(
      "font-brand text-xl tracking-[0.06em] text-primary",
      className
    )}>
      T
    </span>
  )
}
