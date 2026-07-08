import { Transaction, TransactionRepository } from '@transformotion/budget-domain'
import { MOCK_SEED_TRANSACTIONS } from './mock-seed'

export type { Transaction }

const STORAGE_KEY = 'budget-tracker-transactions'

class LocalTransactionRepository implements TransactionRepository {
  private getAll(): Transaction[] {
    if (typeof window === 'undefined') return []
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      // First run only (key absent) → seed the mock demo data. A user-emptied
      // list is stored as '[]' (not null), so clearing data is never re-seeded.
      if (stored === null) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(MOCK_SEED_TRANSACTIONS))
        return [...MOCK_SEED_TRANSACTIONS]
      }
      return JSON.parse(stored)
    } catch {
      return []
    }
  }

  private saveAll(transactions: Transaction[]): void {
    if (typeof window === 'undefined') return
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions))
    } catch {
      console.error('Failed to save transactions to localStorage')
    }
  }

  async findAll(_accountId: string): Promise<Transaction[]> {
    return this.getAll()
  }

  async findById(_accountId: string, id: string): Promise<Transaction | null> {
    return this.getAll().find(t => t.transactionId === id) ?? null
  }

  async upsertBulk(transactions: Transaction[]): Promise<Transaction[]> {
    const all = this.getAll()
    for (const tx of transactions) {
      const index = all.findIndex(t => t.transactionId === tx.transactionId)
      if (index >= 0) {
        all[index] = tx
      } else {
        all.push(tx)
      }
    }
    this.saveAll(all)
    return transactions
  }

  async update(id: string, _accountId: string, updates: Partial<Transaction>): Promise<Transaction> {
    const all = this.getAll()
    const index = all.findIndex(t => t.transactionId === id)
    if (index < 0) throw new Error(`Transaction not found: ${id}`)
    all[index] = { ...all[index], ...updates }
    this.saveAll(all)
    return all[index]
  }

  async delete(id: string, _accountId: string): Promise<void> {
    this.saveAll(this.getAll().filter(t => t.transactionId !== id))
  }

  // Extended query methods (localStorage only — not part of canonical interface)

  findAllSync(): Transaction[] {
    return this.getAll()
  }

  async findByDateRange(start: string, end: string): Promise<Transaction[]> {
    return this.getAll().filter(t => t.date >= start && t.date <= end)
  }

  async findByCategory(category: string, subcategory?: string): Promise<Transaction[]> {
    return this.getAll().filter(t => {
      if (t.category !== category) return false
      if (subcategory && t.subcategory !== subcategory) return false
      return true
    })
  }

  async findUncategorized(): Promise<Transaction[]> {
    return this.getAll().filter(t => !t.category)
  }

  async findBySource(filename: string): Promise<Transaction[]> {
    return this.getAll().filter(t => t.file === filename)
  }
}

export { LocalTransactionRepository }
export type { TransactionRepository }

let _repository: LocalTransactionRepository | null = null

export function getTransactionRepository(): LocalTransactionRepository {
  if (!_repository) {
    _repository = new LocalTransactionRepository()
  }
  return _repository
}
