/**
 * Cache Service Interface
 * 
 * TTL-based caching abstraction.
 * Current: In-memory + localStorage
 * Future: DynamoDB with TTL
 */

export interface CacheOptions {
  /**
   * Time to live in seconds.
   */
  ttl: number

  /**
   * Cache key prefix for namespacing.
   */
  prefix?: string
}

export interface CacheEntry<T> {
  value: T
  expiresAt: number
  createdAt: number
}

export interface CacheService {
  /**
   * Get a cached value by key.
   * Returns null if not found or expired.
   */
  get<T>(key: string): Promise<T | null>

  /**
   * Set a cached value with TTL.
   */
  set<T>(key: string, value: T, ttl?: number): Promise<void>

  /**
   * Delete a cached value.
   */
  delete(key: string): Promise<void>

  /**
   * Delete all cached values matching a prefix.
   */
  deleteByPrefix(prefix: string): Promise<void>

  /**
   * Check if a key exists and is not expired.
   */
  has(key: string): Promise<boolean>

  /**
   * Get time remaining until expiry (in seconds).
   * Returns -1 if not found, 0 if expired.
   */
  ttlRemaining(key: string): Promise<number>

  /**
   * Clear all cached values.
   */
  clear(): Promise<void>

  /**
   * Get or set pattern: fetch from cache or execute function and cache result.
   */
  getOrSet<T>(key: string, fn: () => Promise<T>, ttl?: number): Promise<T>
}

export interface CacheConfig {
  /**
   * Default TTL in seconds.
   */
  defaultTTL: number

  /**
   * Key prefix for all cache entries.
   */
  prefix: string
}

// Re-export implementations
export { MemoryCacheService, createCacheService } from './memory-cache'
export { DynamoTTLCacheService, dynamoCache } from './dynamo-ttl-cache'
