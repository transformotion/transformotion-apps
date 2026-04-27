/**
 * Transaction Repository
 *
 * Data access layer for transactions.
 * Uses DynamoDB via Budget Tracker Lambda API.
 */

import { budgetClient } from '@/lib/api'
import { getConfig } from '@/lib/config'
import { Repository } from '../base-repository'

export interface Transaction {
  _id: string
  date: string
  amount: string
  description: string
  category: string
  subcategory: string
  file: string
  _manual: boolean
  _business: boolean
}

const STORAGE_KEY = 'budget-tracker-transactions'

export interface TransactionRepository extends Repository<Transaction, string> {
  findByDateRange(start: string, end: string): Promise<Transaction[]>
  findByCategory(category: string, subcategory?: string): Promise<Transaction[]>
  findUncategorized(): Promise<Transaction[]>
  findBySource(filename: string): Promise<Transaction[]>
  getNextId(): Promise<string>
  bulkImport(transactions: Omit<Transaction, '_id'>[]): Promise<Transaction[]>
}

// ── localStorage fallback (used in mock mode or if budget API URL is not set) ─

class LocalTransactionRepository implements TransactionRepository {
  private getAll(): Transaction[] {
    if (typeof window === 'undefined') return []
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      return stored ? JSON.parse(stored) : []
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

  async findById(id: string): Promise<Transaction | null> {
    return this.getAll().find(t => String(t._id) === String(id)) ?? null
  }

  async findAll(): Promise<Transaction[]> {
    return this.getAll()
  }

  async save(entity: Transaction): Promise<Transaction> {
    const all = this.getAll()
    const index = all.findIndex(t => String(t._id) === String(entity._id))
    if (index >= 0) { all[index] = entity } else { all.push(entity) }
    this.saveAll(all)
    return entity
  }

  async saveMany(entities: Transaction[]): Promise<Transaction[]> {
    const all = this.getAll()
    for (const entity of entities) {
      const index = all.findIndex(t => String(t._id) === String(entity._id))
      if (index >= 0) { all[index] = entity } else { all.push(entity) }
    }
    this.saveAll(all)
    return entities
  }

  async delete(id: string): Promise<void> {
    this.saveAll(this.getAll().filter(t => String(t._id) !== String(id)))
  }

  async deleteMany(ids: string[]): Promise<void> {
    const idSet = new Set(ids.map(String))
    this.saveAll(this.getAll().filter(t => !idSet.has(String(t._id))))
  }

  async count(): Promise<number> {
    return this.getAll().length
  }

  async exists(id: string): Promise<boolean> {
    return this.getAll().some(t => String(t._id) === String(id))
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

  async getNextId(): Promise<string> {
    const all = this.getAll()
    if (all.length === 0) return '1'
    const maxId = Math.max(...all.map(t => Number(t._id) || 0))
    return String(maxId + 1)
  }

  async bulkImport(transactions: Omit<Transaction, '_id'>[]): Promise<Transaction[]> {
    const existing = this.getAll()
    const maxId = existing.length === 0 ? 0 : Math.max(...existing.map(t => Number(t._id) || 0))
    const withIds = transactions.map((t, i) => ({ ...t, _id: String(maxId + i + 1) }))
    return this.saveMany(withIds)
  }
}

// ── DynamoDB implementation ───────────────────────────────────────────────────

class DynamoTransactionRepository implements TransactionRepository {
  async findAll(): Promise<Transaction[]> {
    const res = await budgetClient.listTransactions()
    return (res.transactions ?? []).map(t => ({ ...t, _id: t._id ?? (t as unknown as Record<string, string>)['transactionId'] }))
  }

  async findById(id: string): Promise<Transaction | null> {
    const all = await this.findAll()
    return all.find(t => t._id === id) ?? null
  }

  async save(entity: Transaction): Promise<Transaction> {
    await budgetClient.patchTransaction(entity._id, {
      category:    entity.category,
      subcategory: entity.subcategory,
      _manual:     entity._manual,
      _business:   entity._business,
    })
    return entity
  }

  async saveMany(entities: Transaction[]): Promise<Transaction[]> {
    // Parallel PATCH for all transactions that have a UUID _id (already in DynamoDB)
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-/i
    const toUpdate = entities.filter(t => uuidPattern.test(String(t._id)))
    if (toUpdate.length > 0) {
      await Promise.all(toUpdate.map(tx =>
        budgetClient.patchTransaction(tx._id, {
          category:    tx.category,
          subcategory: tx.subcategory,
          _manual:     tx._manual,
          _business:   tx._business,
        }).catch(() => {})
      ))
    }
    return entities
  }

  async delete(id: string): Promise<void> {
    await budgetClient.deleteTransaction(id)
  }

  async deleteMany(ids: string[]): Promise<void> {
    await Promise.all(ids.map(id => this.delete(id).catch(() => {})))
  }

  async count(): Promise<number> {
    return (await this.findAll()).length
  }

  async exists(id: string): Promise<boolean> {
    return (await this.findAll()).some(t => t._id === id)
  }

  async findByDateRange(start: string, end: string): Promise<Transaction[]> {
    return (await this.findAll()).filter(t => t.date >= start && t.date <= end)
  }

  async findByCategory(category: string, subcategory?: string): Promise<Transaction[]> {
    return (await this.findAll()).filter(t => {
      if (t.category !== category) return false
      if (subcategory && t.subcategory !== subcategory) return false
      return true
    })
  }

  async findUncategorized(): Promise<Transaction[]> {
    return (await this.findAll()).filter(t => !t.category)
  }

  async findBySource(filename: string): Promise<Transaction[]> {
    return (await this.findAll()).filter(t => t.file === filename)
  }

  async getNextId(): Promise<string> {
    return crypto.randomUUID()
  }

  async bulkImport(transactions: Omit<Transaction, '_id'>[]): Promise<Transaction[]> {
    const res = await budgetClient.bulkImportTransactions({ transactions })
    return (res.transactions ?? []).map(t => ({ ...t, _id: t._id ?? (t as unknown as Record<string, string>)['transactionId'] }))
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

function shouldUseDynamo(): boolean {
  return !getConfig().features.useMockData && !!getConfig().budget.apiUrl
}

export function createTransactionRepository(): TransactionRepository {
  return shouldUseDynamo() ? new DynamoTransactionRepository() : new LocalTransactionRepository()
}

let _repository: TransactionRepository | null = null

export function getTransactionRepository(): TransactionRepository {
  if (!_repository) {
    _repository = createTransactionRepository()
  }
  return _repository
}
