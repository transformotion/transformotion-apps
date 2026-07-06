import { getStockAnalyserClient } from '@/lib/api'
import { getConfig } from '@/lib/config'
import { mockCachedQuotes } from '@transformotion/contracts/stock-analyser/mocks'
import type { CachedQuote } from '@transformotion/contracts/stock-analyser/types'

export type { CachedQuote } from '@transformotion/contracts/stock-analyser/types'

// M21 — read-only enumeration of the latest cached quote per ticker
// (GET /market/cached-quotes). Never triggers a fetch/warm; an empty cache is a
// valid state (empty array). Provider branching lives here so components never
// check flags directly (SA adaptor convention).

const realService = {
  async getQuotes(): Promise<CachedQuote[]> {
    const res = await getStockAnalyserClient().getCachedQuotes()
    return res.quotes ?? []
  },
}

const mockService = {
  async getQuotes(): Promise<CachedQuote[]> {
    return [...mockCachedQuotes]
  },
}

export const cachedQuotesService =
  getConfig().storage.provider === 'local' ? mockService : realService
