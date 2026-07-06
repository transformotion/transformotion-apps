import type { DashboardInsightRepository, DashboardInsightResponse } from '@transformotion/budget-domain'

/**
 * Local/mock dashboard insight. Insight generation is a server-side concern
 * (D9 app-level AI config); mock mode never generates, so this returns a fixed
 * representative line with `stale: false`.
 */
const MOCK_INSIGHT: DashboardInsightResponse = {
  text: "You're on track to save this month — spending is tracking below your budget across most categories.",
  generatedAt: '2026-06-30T00:00:00.000Z',
  stale: false,
}

export class LocalDashboardInsightRepository implements DashboardInsightRepository {
  async get(_accountId: string): Promise<DashboardInsightResponse> {
    return MOCK_INSIGHT
  }
}
