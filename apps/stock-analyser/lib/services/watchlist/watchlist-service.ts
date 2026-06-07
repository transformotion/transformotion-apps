import { getStockAnalyserClient } from '@/lib/api'
import { getConfig } from '@/lib/config'
import type { WatchlistItem } from '@transformotion/contracts/stock-analyser/types'

export type { WatchlistItem } from '@transformotion/contracts/stock-analyser/types'

// ── Mock data ─────────────────────────────────────────────────────────────────

const MOCK_ITEMS: WatchlistItem[] = [
  { ticker: 'CBA.AX',  name: 'Commonwealth Bank of Australia', addedAt: Date.now() - 86400000 * 30 },
  { ticker: 'CSL.AX',  name: 'CSL Limited',                   addedAt: Date.now() - 86400000 * 14 },
  { ticker: 'NVDA',    name: 'NVIDIA Corporation',             addedAt: Date.now() - 86400000 * 7,  addedPrice: 875.30 },
  { ticker: 'WDS.AX',  name: 'Woodside Energy Group',         addedAt: Date.now() - 86400000 * 60 },
]

let mockStore: WatchlistItem[] = [...MOCK_ITEMS]

// ── Real service ──────────────────────────────────────────────────────────────

const realService = {
  async getItems(): Promise<WatchlistItem[]> {
    const res = await getStockAnalyserClient().getWatchlist()
    return res.items ?? []
  },
  async saveItems(items: WatchlistItem[]): Promise<void> {
    await getStockAnalyserClient().putWatchlist({ items })
  },
}

// ── Mock service ──────────────────────────────────────────────────────────────

const mockService = {
  async getItems(): Promise<WatchlistItem[]> {
    return [...mockStore]
  },
  async saveItems(items: WatchlistItem[]): Promise<void> {
    mockStore = [...items]
  },
}

// ── Export ────────────────────────────────────────────────────────────────────

export const watchlistService = getConfig().storage.provider === 'local'
  ? mockService
  : realService
