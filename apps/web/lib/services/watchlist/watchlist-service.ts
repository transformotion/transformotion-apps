import { getAPIClient } from '@/lib/api/client'

export interface WatchlistItem {
  ticker:      string
  name:        string
  addedAt:     number   // unix ms
  addedPrice?: number
}

export const watchlistService = {
  async getItems(): Promise<WatchlistItem[]> {
    const res = await getAPIClient().get<{ items: WatchlistItem[] }>('/watchlist')
    return res.items ?? []
  },

  async saveItems(items: WatchlistItem[]): Promise<void> {
    await getAPIClient().put('/watchlist', { items })
  },
}
