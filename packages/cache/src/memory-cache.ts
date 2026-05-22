import { CacheService, CacheConfig, CacheEntry } from './index'

const DEFAULT_TTL = 300 // 5 minutes
const STORAGE_PREFIX = 'cache:'

export class MemoryCacheService implements CacheService {
  private memory: Map<string, CacheEntry<unknown>> = new Map()
  private prefix: string
  private defaultTTL: number

  constructor(config: CacheConfig) {
    this.prefix = config.prefix
    this.defaultTTL = config.defaultTTL
  }

  private getFullKey(key: string): string {
    return `${STORAGE_PREFIX}${this.prefix}:${key}`
  }

  private isExpired(entry: CacheEntry<unknown>): boolean {
    return Date.now() >= entry.expiresAt
  }

  async get<T>(key: string): Promise<T | null> {
    const fullKey = this.getFullKey(key)

    const memEntry = this.memory.get(fullKey) as CacheEntry<T> | undefined
    if (memEntry) {
      if (this.isExpired(memEntry)) {
        this.memory.delete(fullKey)
        return null
      }
      return memEntry.value
    }

    if (typeof window === 'undefined') return null

    try {
      const stored = localStorage.getItem(fullKey)
      if (!stored) return null

      const entry = JSON.parse(stored) as CacheEntry<T>
      if (this.isExpired(entry)) {
        localStorage.removeItem(fullKey)
        return null
      }

      this.memory.set(fullKey, entry)
      return entry.value
    } catch {
      return null
    }
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    const fullKey = this.getFullKey(key)
    const now = Date.now()
    const ttlMs = (ttl || this.defaultTTL) * 1000

    const entry: CacheEntry<T> = {
      value,
      expiresAt: now + ttlMs,
      createdAt: now,
    }

    this.memory.set(fullKey, entry)

    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(fullKey, JSON.stringify(entry))
      } catch {
        // Storage full - just use memory
      }
    }
  }

  async delete(key: string): Promise<void> {
    const fullKey = this.getFullKey(key)
    this.memory.delete(fullKey)

    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem(fullKey)
      } catch {
        // Ignore
      }
    }
  }

  async deleteByPrefix(prefix: string): Promise<void> {
    const fullPrefix = this.getFullKey(prefix)

    for (const key of this.memory.keys()) {
      if (key.startsWith(fullPrefix)) {
        this.memory.delete(key)
      }
    }

    if (typeof window !== 'undefined') {
      try {
        const keysToDelete: string[] = []
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i)
          if (key?.startsWith(fullPrefix)) {
            keysToDelete.push(key)
          }
        }
        keysToDelete.forEach(key => localStorage.removeItem(key))
      } catch {
        // Ignore
      }
    }
  }

  async has(key: string): Promise<boolean> {
    const value = await this.get(key)
    return value !== null
  }

  async ttlRemaining(key: string): Promise<number> {
    const fullKey = this.getFullKey(key)

    const entry = this.memory.get(fullKey)
    if (entry) {
      return Math.max(0, Math.floor((entry.expiresAt - Date.now()) / 1000))
    }

    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem(fullKey)
        if (stored) {
          const parsed = JSON.parse(stored) as CacheEntry<unknown>
          return Math.max(0, Math.floor((parsed.expiresAt - Date.now()) / 1000))
        }
      } catch {
        // Ignore
      }
    }

    return -1
  }

  async clear(): Promise<void> {
    this.memory.clear()

    if (typeof window !== 'undefined') {
      try {
        const keysToDelete: string[] = []
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i)
          if (key?.startsWith(`${STORAGE_PREFIX}${this.prefix}:`)) {
            keysToDelete.push(key)
          }
        }
        keysToDelete.forEach(key => localStorage.removeItem(key))
      } catch {
        // Ignore
      }
    }
  }

  async getOrSet<T>(key: string, fn: () => Promise<T>, ttl?: number): Promise<T> {
    const cached = await this.get<T>(key)
    if (cached !== null) {
      return cached
    }

    const value = await fn()
    await this.set(key, value, ttl)
    return value
  }
}

export function createCacheService(prefix: string, defaultTTL?: number): CacheService {
  return new MemoryCacheService({
    prefix,
    defaultTTL: defaultTTL || DEFAULT_TTL,
  })
}
