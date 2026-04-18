import { getAPIClient } from '@/lib/api/client'
import { getConfig } from '@/lib/config'

export interface WatchlistItem {
  ticker:      string
  name:        string
  addedAt:     number   // unix ms
  addedPrice?: number
}

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
    const res = await getAPIClient().get<{ items: WatchlistItem[] }>('/watchlist')
    return res.items ?? []
  },
  async saveItems(items: WatchlistItem[]): Promise<void> {
    await getAPIClient().put('/watchlist', { items })
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

export const watchlistService = getConfig().features.useMockData
  ? mockService
  : realService
