/**
 * Zustand store — persistent tab state for the Stock Signal Analyser.
 *
 * Each tab slice holds its display data so state survives React Router
 * unmount/remount when the user switches between tabs. Data is never
 * cleared on tab switch — only on explicit user action (Refresh button,
 * new search, logout).
 *
 * DynamoDB cache remains the cross-session persistence layer. Zustand
 * provides within-session persistence so returning to a tab is instant.
 */

import { create } from 'zustand';
import type { WatchlistItem, PortfolioHolding } from '@transformotion/api-client';
import type {
  GeoMarket,    MarketData,
  RecsMarket,   RecsMode,    RecsData,
  EtfMarket,    EtfsData,
  MetalsResponse,
  AnalysisData,
  WatchlistAnalysis,
  HoldingAnalysis,
} from '../types/stock';

// ── Slice shapes ──────────────────────────────────────────────────────────────

export interface MarketSlice {
  geo:      GeoMarket;
  data:     MarketData | null;
  cachedAt: string | null;
}

export interface RecsSlice {
  market:       RecsMarket;
  mode:         RecsMode;
  sectorFilter: string | null;
  bestMarket:   string | null;
  data:         RecsData | null;
  cachedAt:     string | null;
}

export interface EtfsSlice {
  market:   EtfMarket;
  data:     EtfsData | null;
  cachedAt: string | null;
}

export interface MetalsSlice {
  data:     MetalsResponse | null;
  cachedAt: string | null;
}

export interface AnalyserSlice {
  inputValue: string;
  data:       AnalysisData | null;
  cachedAt:   string | null;
}

export interface WatchlistSlice {
  items:    WatchlistItem[];
  analyses: Record<string, WatchlistAnalysis>;
}

export interface PortfolioSlice {
  holdings: PortfolioHolding[];
  analyses: Record<string, HoldingAnalysis>;
}

// ── Store interface ───────────────────────────────────────────────────────────

interface TabStore {
  market:    MarketSlice;
  recs:      RecsSlice;
  etfs:      EtfsSlice;
  metals:    MetalsSlice;
  analyser:  AnalyserSlice;
  watchlist: WatchlistSlice;
  portfolio: PortfolioSlice;

  setMarket:    (updates: Partial<MarketSlice>)    => void;
  setRecs:      (updates: Partial<RecsSlice>)      => void;
  setEtfs:      (updates: Partial<EtfsSlice>)      => void;
  setMetals:    (updates: Partial<MetalsSlice>)    => void;
  setAnalyser:  (updates: Partial<AnalyserSlice>)  => void;
  setWatchlist: (updates: Partial<WatchlistSlice>) => void;
  setPortfolio: (updates: Partial<PortfolioSlice>) => void;

  /** Reset all tab state (used on logout). */
  resetAll: () => void;
}

// ── Default values ────────────────────────────────────────────────────────────

const DEFAULT_MARKET:    MarketSlice    = { geo: 'Global', data: null, cachedAt: null };
const DEFAULT_RECS:      RecsSlice      = { market: 'ASX', mode: 'top', sectorFilter: null, bestMarket: null, data: null, cachedAt: null };
const DEFAULT_ETFS:      EtfsSlice      = { market: 'ASX', data: null, cachedAt: null };
const DEFAULT_METALS:    MetalsSlice    = { data: null, cachedAt: null };
const DEFAULT_ANALYSER:  AnalyserSlice  = { inputValue: '', data: null, cachedAt: null };
const DEFAULT_WATCHLIST: WatchlistSlice = { items: [], analyses: {} };
const DEFAULT_PORTFOLIO: PortfolioSlice = { holdings: [], analyses: {} };

// ── Store ─────────────────────────────────────────────────────────────────────

export const useTabStore = create<TabStore>(set => ({
  market:    { ...DEFAULT_MARKET    },
  recs:      { ...DEFAULT_RECS      },
  etfs:      { ...DEFAULT_ETFS      },
  metals:    { ...DEFAULT_METALS    },
  analyser:  { ...DEFAULT_ANALYSER  },
  watchlist: { ...DEFAULT_WATCHLIST },
  portfolio: { ...DEFAULT_PORTFOLIO },

  setMarket:    updates => set(s => ({ market:    { ...s.market,    ...updates } })),
  setRecs:      updates => set(s => ({ recs:      { ...s.recs,      ...updates } })),
  setEtfs:      updates => set(s => ({ etfs:      { ...s.etfs,      ...updates } })),
  setMetals:    updates => set(s => ({ metals:    { ...s.metals,    ...updates } })),
  setAnalyser:  updates => set(s => ({ analyser:  { ...s.analyser,  ...updates } })),
  setWatchlist: updates => set(s => ({ watchlist: { ...s.watchlist, ...updates } })),
  setPortfolio: updates => set(s => ({ portfolio: { ...s.portfolio, ...updates } })),

  resetAll: () => set({
    market:    { ...DEFAULT_MARKET    },
    recs:      { ...DEFAULT_RECS      },
    etfs:      { ...DEFAULT_ETFS      },
    metals:    { ...DEFAULT_METALS    },
    analyser:  { ...DEFAULT_ANALYSER  },
    watchlist: { ...DEFAULT_WATCHLIST },
    portfolio: { ...DEFAULT_PORTFOLIO },
  }),
}));
