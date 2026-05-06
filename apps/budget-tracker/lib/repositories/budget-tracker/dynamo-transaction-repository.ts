import type { HttpClient } from '@transformotion/api-client'
import type { Transaction, TransactionRepository } from '@transformotion/budget-domain'

const BASE = '/api/budget/v1/transactions'

export class DynamoTransactionRepository implements TransactionRepository {
  constructor(private readonly http: HttpClient) {}

  async findAll(_accountId: string): Promise<Transaction[]> {
    const res = await this.http.get<{ transactions: Transaction[] }>(BASE)
    return res.transactions
  }

  async findById(_accountId: string, id: string): Promise<Transaction | null> {
    try {
      const res = await this.http.get<{ transaction: Transaction }>(`${BASE}/${id}`)
      return res.transaction
    } catch {
      return null
    }
  }

  async upsertBulk(transactions: Transaction[]): Promise<Transaction[]> {
    const res = await this.http.post<{ transactions: Transaction[] }>(`${BASE}/bulk`, { transactions })
    return res.transactions
  }

  async update(id: string, _accountId: string, updates: Partial<Transaction>): Promise<Transaction> {
    const res = await this.http.patch<{ transaction: Transaction }>(`${BASE}/${id}`, updates)
    return res.transaction
  }

  async delete(id: string, _accountId: string): Promise<void> {
    await this.http.delete(`${BASE}/${id}`)
  }
}
