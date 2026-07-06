import type { HttpClient } from '@transformotion/api-client'
import type { DashboardInsightRepository, DashboardInsightResponse } from '@transformotion/budget-domain'

const BASE = '/api/budget/v1/dashboard-insight'

/**
 * M21 — reads the account-shared dashboard insight. The server regenerates on
 * read when the cached row is absent / stale / invalidated (D9 app-level AI
 * config); the client only reads and renders the returned `stale` flag.
 */
export class DynamoDashboardInsightRepository implements DashboardInsightRepository {
  constructor(private readonly http: HttpClient) {}

  async get(_accountId: string): Promise<DashboardInsightResponse> {
    return this.http.get<DashboardInsightResponse>(BASE)
  }
}
