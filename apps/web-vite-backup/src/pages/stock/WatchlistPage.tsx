import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useApiClient } from '../../hooks/useApiClient';
import { useClaude } from '../../hooks/useClaude';
import { useApiCache } from '../../hooks/useApiCache';
import type { WatchlistItem } from '@transformotion/api-client';
import { MiniCycleBar } from '../../components/stock/CycleGauge';
import { ErrorBox, LoadingSpinner } from './MarketPage';
import { CK, isCacheFresh, formatCacheAge } from '../../lib/cacheConfig';
import { useTabStore } from '../../store/tabStore';
import type { WatchlistAnalysis } from '../../types/stock';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Strip currency symbols and non-numeric chars, return a positive float or undefined. */
function parsePriceToNumber(s?: string): number | undefined {
  if (!s) return undefined;
  const n = parseFloat(s.replace(/[^0-9.]/g, ''));
  return isNaN(n) || n <= 0 ? undefined : n;
}

/** Format Unix ms as "12 Jan 2026". */
function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ── Cache shape normaliser ────────────────────────────────────────────────────
// Handles both AnalysisData (nested cyclePosition) and HoldingAnalysis (flat)
// shapes that may be stored under the same ANALYSIS# key.

function cacheToWatchlist(
  ticker: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any,
  cachedAt: string,
): WatchlistAnalysis {
  return {
    ticker,
    companyName:  data.companyName,
    exchange:     data.exchange,
    type:         data.type,
    currentPrice: data.currentPrice,
    priceChange:  data.priceChange,
    verdict:      data.verdict,
    verdictReason: data.verdictReason,
    cycleScore:   data.cycleScore ?? data.cyclePosition?.score,
    cycleStage:   data.cycleStage ?? data.cyclePosition?.stage,
    cachedAt,
  };
}

// ── Component ─────────────────────────────────────────────────────────────────

export function WatchlistPage() {
  const location   = useLocation();
  const navigate   = useNavigate();
  const routeState = location.state as { addTicker?: string; addName?: string } | null;

  // ── Zustand store for cross-tab persistence ───────────────────────────────
  const storeWatchlist   = useTabStore(s => s.watchlist);
  const setWatchlistStore = useTabStore(s => s.setWatchlist);

  // Initialize from store so re-mounting the tab shows data instantly
  const [items,           setItemsLocal]      = useState<WatchlistItem[]>(storeWatchlist.items);
  const [analyses,        setAnalysesLocal]   = useState<Record<string, WatchlistAnalysis>>(storeWatchlist.analyses);
  const [loadingTickers,  setLoadingTickers]  = useState<Set<string>>(new Set());
  const [refreshProgress, setRefreshProgress] = useState<string | null>(null);
  // Skip loading spinner if we already have data from a previous visit
  const [loadingDb,       setLoadingDb]       = useState(storeWatchlist.items.length === 0);
  const [syncing,         setSyncing]         = useState(false);
  const [error,           setError]           = useState<string | null>(null);
  const [addInput,        setAddInput]        = useState('');
  const [addName,         setAddName]         = useState('');

  const api                  = useApiClient();
  const { callClaude }       = useClaude();
  const { getCache, putCache } = useApiCache();

  // Stable ref so callbacks can always read the latest items without dep churn.
  const itemsRef = useRef(items);
  useEffect(() => { itemsRef.current = items; }, [items]);

  // Wrappers that keep local state and Zustand in sync
  const setItems = useCallback((newItems: WatchlistItem[]) => {
    setItemsLocal(newItems);
    setWatchlistStore({ items: newItems });
  }, [setWatchlistStore]);

  const setAnalyses = useCallback((
    updater: Record<string, WatchlistAnalysis> | ((prev: Record<string, WatchlistAnalysis>) => Record<string, WatchlistAnalysis>),
  ) => {
    if (typeof updater === 'function') {
      setAnalysesLocal(prev => {
        const next = updater(prev);
        setWatchlistStore({ analyses: next });
        return next;
      });
    } else {
      setAnalysesLocal(updater);
      setWatchlistStore({ analyses: updater });
    }
  }, [setWatchlistStore]);

  // Load watchlist from DynamoDB on mount.
  // If store already has items (previous visit this session), loadingDb starts false
  // so we skip the spinner and just background-refresh.
  useEffect(() => {
    api.getWatchlist()
      .then(r => setItems(r.items ?? []))
      .catch(() => { /* keep existing items */ })
      .finally(() => setLoadingDb(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);

  // Handle navigation from Analyser's "Add to Watchlist" button.
  // Deps include routeState?.addTicker so this fires even when the component
  // is already mounted (e.g. navigating back to a live Watchlist tab).
  useEffect(() => {
    if (routeState?.addTicker && !loadingDb) {
      navigate('/stock/watchlist', { replace: true, state: null });
      void addItem(routeState.addTicker, routeState.addName ?? routeState.addTicker);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeState?.addTicker, loadingDb]);

  // On mount: load cached analyses immediately, then auto-enrich any items
  // without a cache entry using a single batch Claude call (same as Portfolio).
  useEffect(() => {
    if (loadingDb || items.length === 0) return;
    const uncached: WatchlistItem[] = [];
    void Promise.allSettled(
      items.map(async item => {
        const cached = await getCache<WatchlistAnalysis>(CK.analysis(item.ticker));
        if (cached?.data) {
          setAnalyses(prev => ({
            ...prev,
            [item.ticker]: cacheToWatchlist(item.ticker, cached.data, cached.cachedAt),
          }));
        } else {
          uncached.push(item);
        }
      }),
    ).then(() => {
      if (uncached.length > 0) void runBatchEnrich(uncached);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingDb]);

  const syncToDb = useCallback(async (newItems: WatchlistItem[]) => {
    setSyncing(true);
    try {
      await api.putWatchlist({ items: newItems });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sync failed');
    } finally {
      setSyncing(false);
    }
  }, [api]);

  // ── Batch enrichment (single Claude call for N items) ────────────────────

  const runBatchEnrich = useCallback(async (staleItems: WatchlistItem[]) => {
    if (!staleItems.length) return;
    const n = staleItems.length;
    setRefreshProgress(`Refreshing ${n} item${n !== 1 ? 's' : ''}…`);
    setLoadingTickers(new Set(staleItems.map(i => i.ticker)));

    const tickers = staleItems.map(i => i.ticker);
    const prompt = `Financial analyst with web search. Analyse these ${n} stocks/ETFs: ${tickers.join(', ')}
Return ONLY a JSON array — no markdown, no XML tags, no citation tags inside any field value:
[{"ticker":"TICKER","companyName":"Full name","exchange":"ASX|NASDAQ|NYSE|LSE","type":"Stock or ETF","currentPrice":"e.g. A$38.50","priceChange":"e.g. +1.2%","verdict":"BUY|HOLD|SELL|NEUTRAL","verdictReason":"One sentence.","cycleScore":65,"cycleStage":"early|mid|late|peak"},...]
Include one object per ticker in the same order as the input list.

CYCLE SCORE RULES: cycleScore measures price cycle position ONLY — not fundamentals. 0–35=early (near 52w lows, oversold, accumulation). 35–60=mid (recovering, momentum building). 60–80=late (near highs, RSI elevated). 80–100=peak (at/near 52w highs, overbought). Weight: (1) distance from 52w high, (2) RSI, (3) distance from 52w low. Ignore P/E, growth, analyst ratings. A great company 20%+ below its 52w high scores 25–40.`;

    try {
      const results = await callClaude<(WatchlistAnalysis & { ticker: string })[]>({
        prompt, webSearch: true, maxTokens: Math.max(2000, n * 500),
      });
      const now = new Date().toISOString();
      const resultMap = new Map<string, WatchlistAnalysis & { ticker: string }>();
      for (const r of (Array.isArray(results) ? results : [])) {
        if (r?.ticker) {
          resultMap.set(r.ticker.toUpperCase(), r);
          resultMap.set(r.ticker.toUpperCase().split('.')[0], r);
        }
      }
      await Promise.allSettled(staleItems.map(async item => {
        const key  = item.ticker.toUpperCase();
        const bare = key.split('.')[0];
        const result = resultMap.get(key) ?? resultMap.get(bare);
        if (result) {
          const analysis = cacheToWatchlist(item.ticker, result, now);
          setAnalyses(prev => ({ ...prev, [item.ticker]: analysis }));
          void putCache(CK.analysis(item.ticker), { ...result, ticker: item.ticker }, 'live', 'analyser');
        }
        setLoadingTickers(prev => { const next = new Set(prev); next.delete(item.ticker); return next; });
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Enrichment failed');
    } finally {
      setRefreshProgress(null);
      setLoadingTickers(new Set());
    }
  }, [callClaude, putCache, setAnalyses]);

  // ── Per-item enrichment (used when a single new item is added) ────────────

  const enrichItem = useCallback(async (ticker: string, captureAddedPrice = false) => {
    // Check cache first — cross-tab: Analyser may have already populated it
    const cached = await getCache<WatchlistAnalysis>(CK.analysis(ticker));
    if (cached && isCacheFresh(cached.cachedAt, 'analyser')) {
      console.log('[watchlist] Cache hit for', ticker, '— rendering full card');
      setAnalyses(prev => ({ ...prev, [ticker]: cacheToWatchlist(ticker, cached.data, cached.cachedAt) }));
      return;
    }

    console.log('[watchlist] No cache for', ticker, '— triggering enrichment');

    // Mark as loading (skeleton)
    setLoadingTickers(prev => new Set(prev).add(ticker));

    const prompt = `Financial analyst with web search. For ticker: ${ticker}
Return ONLY valid JSON. No markdown, no XML tags, no citation tags in any field value:
{"ticker":"${ticker}","companyName":"Full name","exchange":"ASX|NASDAQ|NYSE|LSE","type":"Stock|ETF","currentPrice":"e.g. A$38.50","priceChange":"e.g. +1.2%","verdict":"BUY|HOLD|SELL|NEUTRAL","verdictReason":"One sentence.","cycleScore":65,"cycleStage":"early|mid|late|peak"}
Use web search for the current price.
CYCLE SCORE RULES: cycleScore measures price cycle position ONLY — not fundamentals. 0–35=early (near 52w lows, oversold). 35–60=mid (recovering). 60–80=late (near highs, RSI elevated). 80–100=peak (at/near 52w highs, overbought). A stock 20%+ below its 52w high scores 25–40.`;

    try {
      const result = await callClaude<WatchlistAnalysis>({ prompt, webSearch: true, maxTokens: 600 });
      const now = new Date().toISOString();
      const analysis = cacheToWatchlist(ticker, result, now);
      setAnalyses(prev => ({ ...prev, [ticker]: analysis }));
      void putCache(CK.analysis(ticker), result, 'live', 'analyser');

      // Only capture addedPrice when the item was just added to the watchlist
      if (captureAddedPrice) {
        const price = parsePriceToNumber(result.currentPrice);
        if (price !== undefined) {
          const updated = itemsRef.current.map(i =>
            i.ticker === ticker ? { ...i, addedPrice: price } : i
          );
          setItems(updated);
          void syncToDb(updated);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : `Failed to enrich ${ticker}`);
    } finally {
      setLoadingTickers(prev => {
        const next = new Set(prev);
        next.delete(ticker);
        return next;
      });
    }
  }, [callClaude, getCache, putCache, setItems, syncToDb]);

  const addItem = useCallback(async (ticker: string, name: string) => {
    const t = ticker.trim().toUpperCase();
    const n = name.trim() || t;
    if (!t) return;
    // Use itemsRef.current so this callback always sees the latest items regardless
    // of when it was captured — avoids stale closure when called from a useEffect
    // that doesn't list addItem in its deps.
    if (itemsRef.current.some(i => i.ticker === t)) {
      // Already in list — still enrich in case the Analyser just updated its cache
      void enrichItem(t);
      return;
    }
    const newItem: WatchlistItem = { ticker: t, name: n, addedAt: Date.now() };
    const updated = [...itemsRef.current, newItem];
    setItems(updated);
    await syncToDb(updated);
    void enrichItem(t, true);
  }, [syncToDb, enrichItem, setItems]);

  function removeItem(ticker: string) {
    const updated = items.filter(i => i.ticker !== ticker);
    setItems(updated);
    void syncToDb(updated);
  }

  // ── Refresh all (stale-only) ──────────────────────────────────────────────

  async function refreshAll() {
    if (!items.length) return;
    setError(null);

    // Classify: show fresh cards immediately, batch-enrich the stale ones
    const staleItems: WatchlistItem[] = [];
    const freshMap: Record<string, WatchlistAnalysis> = { ...analyses };

    await Promise.allSettled(items.map(async item => {
      const cached = await getCache<WatchlistAnalysis>(CK.analysis(item.ticker));
      if (cached && isCacheFresh(cached.cachedAt, 'analyser')) {
        freshMap[item.ticker] = cacheToWatchlist(item.ticker, cached.data, cached.cachedAt);
      } else {
        staleItems.push(item);
      }
    }));

    setAnalyses({ ...freshMap });
    if (!staleItems.length) return;

    await runBatchEnrich(staleItems);
  }

  function handleAddSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!addInput.trim()) return;
    void addItem(addInput.trim(), addName.trim() || addInput.trim());
    setAddInput('');
    setAddName('');
  }

  if (loadingDb) return <LoadingSpinner message="Loading watchlist…" />;

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>

      {/* ── Add form ─────────────────────────────────────────────────── */}
      <form onSubmit={handleAddSubmit} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <input
          value={addInput}
          onChange={e => setAddInput(e.target.value)}
          placeholder="Ticker (e.g. BHP.AX)"
          style={{ flex: 1, minWidth: 140, padding: '0.5rem 0.75rem', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-bg-surface)', color: 'var(--color-text-primary)', fontSize: '0.875rem', outline: 'none' }}
        />
        <input
          value={addName}
          onChange={e => setAddName(e.target.value)}
          placeholder="Name (optional)"
          style={{ flex: 2, minWidth: 160, padding: '0.5rem 0.75rem', borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-bg-surface)', color: 'var(--color-text-primary)', fontSize: '0.875rem', outline: 'none' }}
        />
        <button
          type="submit"
          disabled={!addInput.trim()}
          style={{ padding: '0.5rem 1rem', borderRadius: 8, border: '1px solid var(--color-accent)', background: 'rgba(77,159,255,0.15)', color: 'var(--color-accent)', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer' }}
        >
          + Add
        </button>
        {items.length > 0 && (
          <button
            type="button"
            onClick={refreshAll}
            disabled={refreshProgress !== null}
            style={{ padding: '0.5rem 1rem', borderRadius: 8, border: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-text-muted)', fontSize: '0.8rem', cursor: refreshProgress ? 'not-allowed' : 'pointer', opacity: refreshProgress ? 0.6 : 1 }}
          >
            {refreshProgress ? 'Refreshing…' : '↻ Refresh all'}
          </button>
        )}
        {syncing && <span style={{ alignSelf: 'center', fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>Syncing…</span>}
      </form>

      {refreshProgress && (
        <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginBottom: '0.75rem' }}>
          {refreshProgress}
        </div>
      )}

      {error && <ErrorBox message={error} />}

      {/* ── List ────────────────────────────────────────────────────── */}
      {items.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {items.map(item => (
            <WatchlistCard
              key={item.ticker}
              item={item}
              analysis={analyses[item.ticker]}
              isLoading={loadingTickers.has(item.ticker)}
              onAnalyse={() => navigate('/stock/analyse', { state: { ticker: item.ticker } })}
              onRemove={() => removeItem(item.ticker)}
            />
          ))}
        </div>
      )}

      {/* ── Empty state ──────────────────────────────────────────────── */}
      {items.length === 0 && !error && (
        <div style={{ textAlign: 'center', padding: '4rem 1rem', color: 'var(--color-text-muted)' }}>
          <div style={{ fontSize: '0.875rem', maxWidth: 360, margin: '0 auto', lineHeight: 1.6 }}>
            Add tickers to your watchlist to track cycle positions and get alerts when stocks approach peak or enter early-stage BUY territory.
          </div>
        </div>
      )}
    </div>
  );
}

// ── SkeletonBar ───────────────────────────────────────────────────────────────

function SkeletonBar({ width = '100%', height = 10 }: { width?: string | number; height?: number }) {
  return (
    <div
      className="pulse-loading"
      style={{ width, height, borderRadius: 4, background: 'rgba(255,255,255,0.08)' }}
    />
  );
}

// ── WatchlistCard ─────────────────────────────────────────────────────────────

function WatchlistCard({ item, analysis: a, isLoading, onAnalyse, onRemove }: {
  item:      WatchlistItem;
  analysis?: WatchlistAnalysis;
  isLoading: boolean;
  onAnalyse: () => void;
  onRemove:  () => void;
}) {
  const score = a?.cycleScore;

  // P&L since added
  const currentNumeric = parsePriceToNumber(a?.currentPrice);
  const pnlPct = item.addedPrice !== undefined && currentNumeric !== undefined
    ? ((currentNumeric - item.addedPrice) / item.addedPrice) * 100
    : undefined;
  const cycleAlertLevel: 'peak' | 'late' | 'buy' | null =
    score !== undefined
      ? score >= 80  ? 'peak'
      : score >= 65  ? 'late'
      : score  < 40 && a?.verdict === 'BUY' ? 'buy'
      : null
      : null;

  const alertColors = {
    peak: { bg: 'rgba(239,68,68,0.08)',  border: 'rgba(239,68,68,0.3)',  text: '#ef4444' },
    late: { bg: 'rgba(240,160,48,0.08)', border: 'rgba(240,160,48,0.3)', text: '#f0a030' },
    buy:  { bg: 'rgba(77,199,77,0.08)',  border: 'rgba(77,199,77,0.3)',  text: '#4dc74d' },
  };
  const alert        = cycleAlertLevel ? alertColors[cycleAlertLevel] : null;
  const verdictColor = a?.verdict
    ? ({ BUY: '#4dc74d', HOLD: '#f0a030', SELL: '#ef4444', NEUTRAL: '#94a3b8' }[a.verdict] ?? '#94a3b8')
    : undefined;

  // ── Skeleton state ────────────────────────────────────────────────────────
  if (isLoading && !a) {
    return (
      <div style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', borderRadius: 10, padding: '0.875rem', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ fontFamily: 'monospace', fontSize: '0.9rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>{item.ticker}</span>
              <SkeletonBar width={120} height={12} />
            </div>
            <SkeletonBar width="70%" height={10} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
            <SkeletonBar width={60} height={14} />
            <SkeletonBar width={40} height={10} />
          </div>
        </div>
        <SkeletonBar width="100%" height={4} />
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: 2 }}>
          <SkeletonBar width={80} height={24} />
          <SkeletonBar width={70} height={24} />
        </div>
      </div>
    );
  }

  // ── Full card ─────────────────────────────────────────────────────────────
  return (
    <div style={{
      background:   alert ? alert.bg    : 'var(--color-bg-surface)',
      border:       `1px solid ${alert ? alert.border : 'var(--color-border)'}`,
      borderRadius: 10,
      padding:      '0.875rem',
    }}>

      {/* ── Header: ticker / company / badges + price ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '0.375rem' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
            <button
              onClick={onAnalyse}
              style={{ fontFamily: 'monospace', fontSize: '0.9rem', fontWeight: 700, color: 'var(--color-accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              {item.ticker}
            </button>
            {a?.companyName && (
              <span style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>{a.companyName}</span>
            )}
            {!a?.companyName && (
              <span style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>{item.name}</span>
            )}
            {a?.exchange && (
              <span style={{ fontSize: '0.62rem', color: 'var(--color-text-muted)', padding: '1px 5px', borderRadius: 3, border: '1px solid var(--color-border)' }}>
                {a.exchange}
              </span>
            )}
            {a?.type && (
              <span style={{ fontSize: '0.62rem', color: 'var(--color-text-muted)', padding: '1px 5px', borderRadius: 3, border: '1px solid var(--color-border)' }}>
                {a.type}
              </span>
            )}
            {verdictColor && a?.verdict && (
              <span style={{ fontSize: '0.62rem', fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: `${verdictColor}15`, color: verdictColor, border: `1px solid ${verdictColor}40` }}>
                {a.verdict}
              </span>
            )}
          </div>
          {a?.verdictReason && (
            <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', marginTop: 2, lineHeight: 1.4 }}>
              {a.verdictReason}
            </div>
          )}
        </div>

        {/* Price */}
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          {a?.currentPrice && (
            <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>{a.currentPrice}</div>
          )}
          {a?.priceChange && (
            <div style={{ fontSize: '0.72rem', fontWeight: 600, color: a.priceChange.startsWith('-') ? '#ef4444' : '#4dc74d' }}>
              {a.priceChange}
            </div>
          )}
        </div>
      </div>

      {/* ── Date added + P&L ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.375rem', marginBottom: '0.25rem' }}>
        <span style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>
          Added {formatDate(item.addedAt)}
        </span>
        {pnlPct !== undefined && (
          <>
            <span style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>·</span>
            <span style={{
              fontSize: '0.65rem',
              fontWeight: 600,
              color: pnlPct >= 0 ? '#4dc74d' : '#ef4444',
            }}>
              {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(1)}% since added
            </span>
          </>
        )}
      </div>

      {/* ── Cycle bar ── */}
      {score !== undefined && <MiniCycleBar score={score} stage={a?.cycleStage} />}

      {/* ── Alert message ── */}
      {cycleAlertLevel && (
        <div style={{ fontSize: '0.75rem', color: alert!.text, marginTop: '0.375rem', fontWeight: 500 }}>
          {cycleAlertLevel === 'peak' && <>▼ Approaching cycle peak — consider selling (score {score})</>}
          {cycleAlertLevel === 'late' && <>⚠ Late stage — tighten stops (score {score})</>}
          {cycleAlertLevel === 'buy'  && <>▲ Early cycle + BUY — accumulation opportunity (score {score})</>}
        </div>
      )}

      {/* ── Actions + cache age ── */}
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.625rem', alignItems: 'center' }}>
        <button
          onClick={onAnalyse}
          style={{ fontSize: '0.72rem', padding: '4px 10px', borderRadius: 5, border: '1px solid var(--color-accent)', background: 'rgba(77,159,255,0.12)', color: 'var(--color-accent)', cursor: 'pointer', fontWeight: 600 }}
        >
          ↗ Analyse
        </button>
        <button
          onClick={onRemove}
          style={{ fontSize: '0.72rem', padding: '4px 10px', borderRadius: 5, border: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-text-muted)', cursor: 'pointer' }}
        >
          ✕ Remove
        </button>
        {a?.cachedAt && (
          <span style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', marginLeft: 'auto' }}>
            Updated {formatCacheAge(a.cachedAt)}
          </span>
        )}
      </div>
    </div>
  );
}
