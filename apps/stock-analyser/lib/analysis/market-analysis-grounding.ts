/**
 * Market Analysis — Bucket-1 grounding (M19 #535).
 *
 * Grounds the sector levels/returns the model reasons over in REAL price data,
 * rather than letting it recall or web-search them. We fetch OHLCV for a static
 * per-region SECTOR → PROXY-TICKER map through the EXISTING market-data seam
 * (`getStockAnalyserClient().getOhlcvData`) and inject a SUPPLIED-DATA block into
 * the Market Analysis prompt.
 *
 * Scope (per #535): Bucket-1 (sector levels/returns) ONLY. Bucket-2 (macro:
 * rates/FX/inflation) is DEFERRED — macro stays cited web search, no feed here.
 *
 * === OWNER REVIEW REQUIRED — SECTOR_PROXY_TICKERS (the one net-new artifact) ===
 * These proxy tickers are a FIRST CUT. They are not invented silently: every
 * entry is listed here for sign-off, and gaps are left explicit. An unmapped
 * sector contributes NO supplied data — the model falls back to cited web search
 * for it, never a wrong proxy (still satisfies the #535 source-control bar).
 *   - us: SPDR sector ETFs — established, liquid, unambiguous Yahoo symbols
 *     (high confidence).
 *   - global: FULLY UNMAPPED by decision. US sector ETFs are a US lens on a
 *     global question, so grounding "Global" in them would attribute "grounded"
 *     to the wrong basket — unmapped + cited web search is the honest default.
 *   - australia: only the ASX sector ETFs nameable with confidence; the rest
 *     intentionally UNMAPPED pending owner-supplied proxies. OZR is a
 *     resources-skew proxy for Materials (accepted-with-flag).
 *   - uk: FULLY UNMAPPED pending owner-supplied FTSE sector proxies.
 */

import { getStockAnalyserClient } from '@/lib/api'
import { getConfig } from '@/lib/config'
import { getMockOhlcvData } from '@/lib/services/ai/fixtures/ohlcv-data'
import type { AnalysisRegion } from '@transformotion/contracts/stock-analyser/types'

/** The eight sectors the Market Analysis prompt enumerates (must match the prompt). */
export const MARKET_ANALYSIS_SECTORS = [
  'Financials',
  'Materials',
  'Energy',
  'Healthcare',
  'Technology',
  'Industrials',
  'Consumer Discretionary',
  'Real Estate & REITs',
] as const

export type MarketAnalysisSector = (typeof MARKET_ANALYSIS_SECTORS)[number]

/**
 * Static sector → proxy-ticker map, per region. Partial by design: an unmapped
 * sector contributes no supplied data (graceful degradation). FLAGGED FOR OWNER
 * REVIEW — see the banner above. Tickers are Yahoo-Finance symbols (the
 * market-data Lambda's source).
 */
export const SECTOR_PROXY_TICKERS: Record<
  AnalysisRegion,
  Partial<Record<MarketAnalysisSector, string>>
> = {
  // SPDR Select Sector ETFs (US) — high confidence.
  us: {
    Financials: 'XLF',
    Materials: 'XLB',
    Energy: 'XLE',
    Healthcare: 'XLV',
    Technology: 'XLK',
    Industrials: 'XLI',
    'Consumer Discretionary': 'XLY',
    'Real Estate & REITs': 'XLRE',
  },
  // FULLY UNMAPPED by decision — US sector ETFs are a US lens on a global
  // question; "Global" sectors fall back to cited web search.
  global: {},
  // ASX sector ETFs — only the confident ones; the rest UNMAPPED pending owner review.
  australia: {
    Financials: 'OZF.AX',          // SPDR S&P/ASX 200 Financials ex A-REIT
    Materials: 'OZR.AX',           // SPDR S&P/ASX 200 Resources (resources-skew proxy)
    'Real Estate & REITs': 'SLF.AX', // SPDR S&P/ASX 200 A-REIT
  },
  // FTSE sector proxies — UNMAPPED pending owner review.
  uk: {},
}

/** A fetched sector level/return line for the supplied-data block. */
interface SectorLevel {
  sector: MarketAnalysisSector
  ticker: string
  last: number
  change1mPct: number | null
  change3mPct: number | null
}

function pctChange(closes: readonly number[], lookback: number): number | null {
  if (closes.length === 0) return null
  const last = closes[closes.length - 1]
  const prior = closes[Math.max(0, closes.length - 1 - lookback)]
  if (last === undefined || prior === undefined || prior === 0) return null
  return ((last - prior) / prior) * 100
}

async function fetchSectorLevel(
  sector: MarketAnalysisSector,
  ticker: string,
): Promise<SectorLevel | null> {
  try {
    const ohlcv =
      getConfig().ai.provider === 'mock'
        ? getMockOhlcvData(ticker, '3mo', '1d')
        : await getStockAnalyserClient().getOhlcvData(ticker, '3mo', '1d')
    const closes = ohlcv?.closes ?? []
    const last = closes[closes.length - 1]
    if (last === undefined) return null
    return {
      sector,
      ticker,
      last,
      change1mPct: pctChange(closes, 21), // ~21 trading days ≈ 1 month
      change3mPct: pctChange(closes, closes.length - 1), // full window ≈ 3 months
    }
  } catch {
    return null // best-effort — a failed quote just omits that sector
  }
}

/**
 * Build the SUPPLIED-DATA block for a region's Market Analysis prompt. Fetches
 * each mapped sector proxy's OHLCV and summarises last level + 1m/3m returns so
 * the model reasons over fed sector levels rather than searching for them.
 * Returns `''` when nothing could be fetched (caller injects nothing).
 */
export async function buildSectorSuppliedData(region: AnalysisRegion): Promise<string> {
  const map = SECTOR_PROXY_TICKERS[region] ?? {}
  const entries = Object.entries(map) as [MarketAnalysisSector, string][]
  if (entries.length === 0) return ''

  const levels = (
    await Promise.all(entries.map(([sector, ticker]) => fetchSectorLevel(sector, ticker)))
  ).filter((l): l is SectorLevel => l !== null)

  if (levels.length === 0) return ''

  const lines = levels.map((l) => {
    const fmt = (n: number | null) => (n === null ? 'n/a' : `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`)
    return `- ${l.sector} (proxy ${l.ticker}): last ${l.last.toFixed(2)}, 1m ${fmt(l.change1mPct)}, 3m ${fmt(l.change3mPct)}`
  })

  return `\n\nSUPPLIED SECTOR DATA (real market prices — base each sector's level/return read on THESE figures, not on searched or recalled numbers; cite the proxy as the source for that sector's price read):\n${lines.join('\n')}`
}
