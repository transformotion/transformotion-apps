export interface CacheOptions {
  ttl: number
  prefix?: string
}

export interface CacheEntry<T> {
  value: T
  expiresAt: number
  createdAt: number
}

export interface CacheService {
  get<T>(key: string): Promise<T | null>
  set<T>(key: string, value: T, ttl?: number): Promise<void>
  delete(key: string): Promise<void>
  deleteByPrefix(prefix: string): Promise<void>
  has(key: string): Promise<boolean>
  ttlRemaining(key: string): Promise<number>
  clear(): Promise<void>
  getOrSet<T>(key: string, fn: () => Promise<T>, ttl?: number): Promise<T>
}

export interface CacheConfig {
  defaultTTL: number
  prefix: string
}

export { MemoryCacheService, createCacheService } from './memory-cache'
