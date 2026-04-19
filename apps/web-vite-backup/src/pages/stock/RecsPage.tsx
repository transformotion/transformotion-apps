import { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useClaude } from '../../hooks/useClaude';
import { useApiCache } from '../../hooks/useApiCache';
import { useMode } from '../../contexts/ModeContext';
import { ModeToggle } from '../../components/stock/ModeToggle';
import { SectionDivider, ErrorBox, LoadingSpinner, EmptyState, Footnote, CacheStatusBadge } from './MarketPage';
import { CK, isCacheFresh } from '../../lib/cacheConfig';
import { useTabStore } from '../../store/tabStore';
import type { RecsMarket, RecsMode, StockPick, RecsData } from '../../types/stock';

// ── Constants ─────────────────────────────────────────────────────────────────

const MARKET_OPTIONS: RecsMarket[] = ['ASX', 'NASDAQ', 'Dow Jones', 'FTSE'];

const MARKET_CTX: Record<RecsMarket, string> = {
  ASX:         'Australian Securities Exchange (ASX). AUD pricing. .AX ticker suffixes.',
  NASDAQ:      'NASDAQ. USD pricing.',
  'Dow Jones': 'Dow Jones Industrial Average (NYSE-listed). USD pricing.',
  FTSE:        'FTSE 100, London Stock Exchange. GBP pricing.',
};

const VERDICT_COLORS: Record<string, string> = { BUY: '#4dc74d', HOLD: '#f0a030', SELL: '#ef4444', NEUTRAL: '#94a3b8' };

// ── Component ─────────────────────────────────────────────────────────────────

export function RecsPage() {
  const location   = useLocation();
  const navigate   = useNavigate();
  const routeState = location.state as { sectorFilter?: string; bestMarket?: string; sourceGeo?: string } | null;

  const { market, mode: recsMode, sectorFilter, bestMarket, data, cachedAt } = useTabStore(s => s.recs);
  const setRecs = useTabStore(s => s.setRecs);

  const { callClaude, loading, error, statusMessage } = useClaude();
  const { getCache, putCache }         = useApiCache();
  const { isLive }                     = useMode();

  // Hydrate from DDB on mount so the tab shows data after a page reload,
  // even if the cached entry is stale. Skip if sector drill-through will fetch imminently.
  // Tries new key format first, falls back to old underscore format for backward compatibility.
  useEffect(() => {
    if (data || routeState?.sectorFilter) return;
    const newKey = CK.recs(market, recsMode, sectorFilter);
    const oldKey = `RECS_${market}_${recsMode}${sectorFilter ? '_' + sectorFilter : ''}`;
    void (async () => {
      const cached = await getCache<RecsData>(newKey) ?? await getCache<RecsData>(oldKey);
      if (cached) setRecs({ data: cached.data, cachedAt: cached.cachedAt });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When arriving from sector drill-through, auto-select the market and fetch immediately.
  // Priority: sourceGeo (the market the user was analysing) > bestMarket (Claude's global pick).
  // Uses routeState as dep so it fires even when the component is already mounted.
  useEffect(() => {
    if (!routeState?.sectorFilter) return;

    let targetMarket: RecsMarket = market;

    if (routeState.sourceGeo) {
      // Map the source GeoMarket to a RecsMarket — always use the market being analysed.
      const sg = routeState.sourceGeo.toUpperCase();
      if (sg === 'ASX')       targetMarket = 'ASX';
      else if (sg === 'US')   targetMarket = 'NASDAQ';
      else if (sg === 'UK')   targetMarket = 'FTSE';
      // 'Global' falls through — keep the current market selection
    } else if (routeState.bestMarket) {
      // Legacy fallback: no sourceGeo — use bestMarket string matching
      const bm = routeState.bestMarket.toUpperCase();
      if (bm.includes('NASDAQ'))    targetMarket = 'NASDAQ';
      else if (bm.includes('DOW'))  targetMarket = 'Dow Jones';
      else if (bm.includes('FTSE')) targetMarket = 'FTSE';
      else if (bm.includes('ASX'))  targetMarket = 'ASX';
    }

    setRecs({ market: targetMarket, sectorFilter: routeState.sectorFilter, bestMarket: routeState.bestMarket ?? null });
    navigate('/stock/recs', { replace: true, state: null });
    fetchRecs(targetMarket, recsMode, routeState.sectorFilter);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeState?.sectorFilter]);

  const fetchRecs = useCallback(async (
    selectedMarket: RecsMarket,
    mode: RecsMode,
    sector: string | null,
    forceRefresh = false,
  ) => {
    const cacheKey = CK.recs(selectedMarket, mode, sector);

    if (!forceRefresh) {
      const cached = await getCache<RecsData>(cacheKey);
      if (cached && isCacheFresh(cached.cachedAt, 'recommendations')) {
        setRecs({ data: cached.data, cachedAt: cached.cachedAt });
        return;
      }
    }

    const ctx = MARKET_CTX[selectedMarket];
    let prompt: string;

    if (mode === 'bottom') {
      prompt = `Financial analyst. Find the top 6 stocks on the ${ctx} that are:
1. Rated BUY based on fundamentals and outlook
2. Currently at or near the BOTTOM of their price cycle — specifically: RSI below 45, MACD just turning positive or about to cross, price well below 52-week high (ideally under 70%), volume beginning to build, and early-stage technical setup
${sector ? `Focus specifically on the ${sector} sector.` : ''}
These should be stocks that have pulled back or consolidated and are poised to move up — NOT stocks already in a strong uptrend.
Return ONLY valid JSON. No markdown, no XML tags, no citation tags in any field value:
{"market":"${selectedMarket} — Bottom of cycle picks${sector ? ` (${sector})` : ''}","asOf":"Month YYYY","stocks":[{"ticker":"","companyName":"","sector":"","verdict":"BUY","currentPrice":"","priceChange":"","reason":"2 sentences — early-cycle thesis with RSI level, distance from 52w high, and recovery catalyst."}]}`;
    } else {
      prompt = `Financial analyst. Find the top 6 stocks to buy NOW on the ${ctx}
${sector ? `Focus specifically on the ${sector} sector.` : ''}
Return ONLY valid JSON. No markdown, no XML tags, no citation tags in any field value:
{"market":"${selectedMarket}${sector ? ` — ${sector}` : ''}","asOf":"Month YYYY","stocks":[{"ticker":"","companyName":"","sector":"","verdict":"BUY or HOLD","currentPrice":"","priceChange":"","reason":"2 sentences on specific current buy catalysts."}]}`;
    }

    const result = await callClaude<RecsData>({ prompt, webSearch: true });
    const now = new Date().toISOString();
    setRecs({ data: result, cachedAt: now });
    await putCache(cacheKey, result, isLive ? 'live' : 'fast', 'recommendations');
  }, [callClaude, getCache, putCache, isLive, setRecs]);

  function handleMarketChange(m: RecsMarket) {
    setRecs({ market: m, data: null, cachedAt: null });
  }

  function clearSectorFilter() {
    setRecs({ sectorFilter: null, bestMarket: null, data: null, cachedAt: null });
  }

  function handleAnalyse(ticker: string) {
    navigate('/stock/analyse', { state: { ticker } });
  }

  return (
    <div style={{ maxWidth: 960, margin: '0 auto' }}>

      {/* ── Sector filter banner ─────────────────────────────────────── */}
      {sectorFilter && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.625rem 0.875rem', background: 'rgba(77,159,255,0.08)', border: '1px solid rgba(77,159,255,0.2)', borderRadius: 8, marginBottom: '0.875rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Picks for:</span>
          <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-accent)' }}>{sectorFilter}</span>
          {bestMarket && <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>· Recommended: {bestMarket}</span>}
          <button onClick={clearSectorFilter} style={{ marginLeft: 'auto', fontSize: '0.72rem', padding: '2px 8px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-text-muted)', cursor: 'pointer' }}>✕ Clear</button>
        </div>
      )}

      {/* ── Toolbar ─────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1rem' }}>

        {/* Market selector */}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {MARKET_OPTIONS.map(m => (
            <button
              key={m}
              onClick={() => handleMarketChange(m)}
              style={{
                padding:    '0.375rem 0.75rem',
                borderRadius: 6,
                border:     `1px solid ${market === m ? 'var(--color-accent)' : 'var(--color-border)'}`,
                background: market === m ? 'rgba(77,159,255,0.15)' : 'transparent',
                color:      market === m ? 'var(--color-accent)' : 'var(--color-text-muted)',
                fontSize:   '0.8rem',
                fontWeight: market === m ? 600 : 400,
                cursor:     'pointer',
              }}
            >{m}</button>
          ))}
        </div>

        {/* Mode selector (top/bottom) */}
        <div style={{ display: 'flex', gap: 2, background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', borderRadius: 6, padding: 2 }}>
          {(['top', 'bottom'] as RecsMode[]).map(m => (
            <button
              key={m}
              onClick={() => setRecs({ mode: m, data: null, cachedAt: null })}
              style={{
                padding: '0.25rem 0.625rem',
                borderRadius: 4,
                border: 'none',
                background: recsMode === m ? 'rgba(77,159,255,0.2)' : 'transparent',
                color: recsMode === m ? 'var(--color-accent)' : 'var(--color-text-muted)',
                fontSize: '0.75rem',
                fontWeight: recsMode === m ? 600 : 400,
                cursor: 'pointer',
              }}
            >
              {m === 'top' ? 'Top picks' : 'Bottom of cycle'}
            </button>
          ))}
        </div>

        <ModeToggle />

        <button
          onClick={() => fetchRecs(market, recsMode, sectorFilter, !!data)}
          disabled={loading}
          style={{
            padding:    '0.375rem 1rem',
            borderRadius: 6,
            border:     '1px solid var(--color-accent)',
            background: 'rgba(77,159,255,0.15)',
            color:      'var(--color-accent)',
            fontSize:   '0.8rem',
            fontWeight: 600,
            cursor:     loading ? 'not-allowed' : 'pointer',
            opacity:    loading ? 0.6 : 1,
          }}
        >
          {loading ? 'Scanning…' : data ? '↻ Refresh' : 'Get Picks'}
        </button>

        {cachedAt && !loading && <CacheStatusBadge cachedAt={cachedAt} type="recommendations" />}
      </div>

      {error && <ErrorBox message={error} />}

      {loading && (
        <LoadingSpinner
          message={recsMode === 'bottom' ? `Scanning ${market} for early-cycle BUY candidates…` : `Scanning ${market} for top picks…`}
          subMessage={statusMessage}
        />
      )}

      {data && !loading && (
        <div>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '1rem' }}>
            {data.market} · {data.asOf}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
            {data.stocks.map(stock => (
              <StockCard key={stock.ticker} stock={stock} onClick={() => handleAnalyse(stock.ticker)} />
            ))}
          </div>

          <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', lineHeight: 1.6 }}>
            AI-generated from public data. Not financial advice. Always consult a licensed adviser.
          </div>

          <Footnote isLive={isLive} />
        </div>
      )}

      {!data && !loading && !error && (
        <EmptyState
          message={`Select a market and press Get Picks to see ${recsMode === 'bottom' ? 'early-cycle BUY candidates' : 'top stock picks'} for ${market}.`}
          onAction={() => fetchRecs(market, recsMode, sectorFilter)}
          actionLabel="Get Picks"
        />
      )}
    </div>
  );
}

// ── StockCard ─────────────────────────────────────────────────────────────────

function StockCard({ stock: s, onClick }: { stock: StockPick; onClick: () => void }) {
  const verdictColor = VERDICT_COLORS[s.verdict] ?? '#94a3b8';
  const isUp = !s.priceChange?.startsWith('-');

  return (
    <button
      onClick={onClick}
      style={{
        background: 'var(--color-bg-surface)',
        border: `1px solid ${verdictColor}25`,
        borderRadius: 12,
        padding: '0.875rem',
        textAlign: 'left',
        cursor: 'pointer',
        width: '100%',
        transition: 'border-color 0.15s',
      }}
    >
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
        <div>
          <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--color-text-primary)', fontFamily: 'monospace' }}>{s.ticker}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{s.companyName}</div>
          <div style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)', marginTop: 2 }}>{s.sector}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <span style={{ color: verdictColor, border: `1px solid ${verdictColor}40`, background: `${verdictColor}15`, borderRadius: 4, padding: '2px 8px', fontSize: '0.7rem', fontWeight: 700 }}>
            {s.verdict}
          </span>
          {s.currentPrice && (
            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-text-primary)', marginTop: 4 }}>{s.currentPrice}</div>
          )}
          {s.priceChange && (
            <div style={{ fontSize: '0.72rem', color: isUp ? '#4dc74d' : '#ef4444' }}>{s.priceChange}</div>
          )}
        </div>
      </div>

      {/* Reason */}
      <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', lineHeight: 1.5, marginBottom: 8 }}>{s.reason}</div>

      <div style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)' }}>Tap to analyse →</div>
    </button>
  );
}

export { SectionDivider };
