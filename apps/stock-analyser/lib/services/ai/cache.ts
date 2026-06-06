import { dynamoCache } from '@/lib/services/cache/dynamo-ttl-cache'
import type { ClaudeRequest } from './index'

export async function callWithAIResponseCache<T>(
  request: ClaudeRequest,
  execute: () => Promise<T>,
): Promise<T> {
  const { cacheKey, forceRefresh } = request

  if (cacheKey && !forceRefresh) {
    const cached = await dynamoCache.get<T>(cacheKey)
    if (cached !== null) {
      console.log('[stock-ai] cache hit:', cacheKey)
      return cached
    }
    console.log('[stock-ai] cache miss:', cacheKey)
  } else if (cacheKey && forceRefresh) {
    console.log('[stock-ai] force refresh - bypassing cache:', cacheKey)
  }

  const result = await execute()

  if (cacheKey && result) {
    dynamoCache.set(cacheKey, result).catch(err => {
      console.warn('[stock-ai] cache write failed:', cacheKey, err)
    })
  }

  return result
}
