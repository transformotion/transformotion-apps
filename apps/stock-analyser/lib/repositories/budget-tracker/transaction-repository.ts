/**
 * Transaction Repository
 * 
 * Data access layer for transactions.
 * Current: localStorage
 * Future: DynamoDB via Lambda
 */

import { Repository, RepositoryOptions } from '../base-repository'

// Import Transaction type from budget-tracker
export interface Transaction {
  _id: number
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

export interface TransactionRepository extends Repository<Transaction, number> {
  /**
   * Find transactions by date range.
   */
  findByDateRange(start: string, end: string): Promise<Transaction[]>

  /**
   * Find transactions by category.
   */
  findByCategory(category: string, subcategory?: string): Promise<Transaction[]>

  /**
   * Find uncategorized transactions.
   */
  findUncategorized(): Promise<Transaction[]>

  /**
   * Find transactions by source file.
   */
  findBySource(filename: string): Promise<Transaction[]>

  /**
   * Get the next available ID.
   */
  getNextId(): Promise<number>

  /**
   * Bulk import transactions (upsert by ID).
   */
  bulkImport(transactions: Transaction[]): Promise<Transaction[]>
}

/**
 * localStorage implementation
 */
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

  async findById(id: number): Promise<Transaction | null> {
    const all = this.getAll()
    return all.find(t => t._id === id) || null
  }

  async findAll(filters?: Partial<Transaction>): Promise<Transaction[]> {
    let results = this.getAll()
    
    if (filters) {
      results = results.filter(t => {
        for (const [key, value] of Object.entries(filters)) {
          if (t[key as keyof Transaction] !== value) {
            return false
          }
        }
        return true
      })
    }
    
    return results
  }

  async save(entity: Transaction): Promise<Transaction> {
    const all = this.getAll()
    const index = all.findIndex(t => t._id === entity._id)
    
    if (index >= 0) {
      all[index] = entity
    } else {
      all.push(entity)
    }
    
    this.saveAll(all)
    return entity
  }

  async saveMany(entities: Transaction[]): Promise<Transaction[]> {
    const all = this.getAll()
    
    for (const entity of entities) {
      const index = all.findIndex(t => t._id === entity._id)
      if (index >= 0) {
        all[index] = entity
      } else {
        all.push(entity)
      }
    }
    
    this.saveAll(all)
    return entities
  }

  async delete(id: number): Promise<void> {
    const all = this.getAll()
    const filtered = all.filter(t => t._id !== id)
    this.saveAll(filtered)
  }

  async deleteMany(ids: number[]): Promise<void> {
    const idSet = new Set(ids)
    const all = this.getAll()
    const filtered = all.filter(t => !idSet.has(t._id))
    this.saveAll(filtered)
  }

  async count(filters?: Partial<Transaction>): Promise<number> {
    const results = await this.findAll(filters)
    return results.length
  }

  async exists(id: number): Promise<boolean> {
    const transaction = await this.findById(id)
    return transaction !== null
  }

  // Extended methods

  async findByDateRange(start: string, end: string): Promise<Transaction[]> {
    const all = this.getAll()
    return all.filter(t => t.date >= start && t.date <= end)
  }

  async findByCategory(category: string, subcategory?: string): Promise<Transaction[]> {
    const all = this.getAll()
    return all.filter(t => {
      if (t.category !== category) return false
      if (subcategory && t.subcategory !== subcategory) return false
      return true
    })
  }

  async findUncategorized(): Promise<Transaction[]> {
    const all = this.getAll()
    return all.filter(t => !t.category)
  }

  async findBySource(filename: string): Promise<Transaction[]> {
    const all = this.getAll()
    return all.filter(t => t.file === filename)
  }

  async getNextId(): Promise<number> {
    const all = this.getAll()
    if (all.length === 0) return 1
    const maxId = Math.max(...all.map(t => t._id))
    return maxId + 1
  }

  async bulkImport(transactions: Transaction[]): Promise<Transaction[]> {
    return this.saveMany(transactions)
  }
}

// Factory function
export function createTransactionRepository(): TransactionRepository {
  return new LocalTransactionRepository()
}

// Singleton instance
let _repository: TransactionRepository | null = null

export function getTransactionRepository(): TransactionRepository {
  if (!_repository) {
    _repository = createTransactionRepository()
  }
  return _repository
}
