'use client'

import type { ComponentType } from 'react'
import { EmptyState } from '@/components/ui/design-system'

/**
 * Placeholder content for M11 admin screens scaffolded in the nav but not yet
 * ported. Keeps navigation coherent without faking functionality. Ported
 * verbatim from v0 `components/launchpad/admin/admin-placeholder.tsx`.
 */
export function AdminPlaceholder({
  icon,
  title,
  description,
}: {
  icon: ComponentType<{ className?: string }>
  title: string
  description: string
}) {
  return <EmptyState icon={icon} title={title} description={description} />
}
