import { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useApiClient } from '../../hooks/useApiClient';
import { useClaude } from '../../hooks/useClaude';
import { useApiCache } from '../../hooks/useApiCache';
import type { WatchlistItem } from '@transformotion/api-client';
import { ErrorBox, LoadingSpinner } from './MarketPage';

// ── Types ─────────────────────────────────────────────────────────────────────

interface WatchlistAnalysis {
  ticker:       string;
  companyName?: string;
  currentPrice?:string;
  priceChange?: string;
  verdict?:     string;
  cycleScore?:  number;
  cycleStage?:  string;
  summary?:     string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function WatchlistPage() {
  const location   = useLocation();
  const navigate   = useNavigate();
  const routeState = location.state as { addTicker?: string; addName?: string } | null;

  const [items,      setItems]      = useState<WatchlistItem[]>([]);
  const [analyses,   setAnalyses]   = useState<Record<string, WatchlistAnalysis>>({});
  const [loadingDb,  setLoadingDb]  = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncing,    setSyncing]    = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [addInput,   setAddInput]   = useState('');
  const [addName,    setAddName]    = useState('');

  const api      = useApiClient();
  const { callClaude } = useClaude();
  const { getCache, putCache } = useApiCache();

  // Load watchlist from DynamoDB on mount
  useEffect(() => {
    api.getWatchlist()
      .then(r => setItems(r.items ?? []))
      .catch(() => setItems([]))
      .finally(() => setLoadingDb(false));
  }, [api]);

  // Handle navigation from Analyser's "Add to Watchlist" button
  useEffect(() => {
    if (routeState?.addTicker && !loadingDb) {
      navigate('/stock/watchlist', { replace: true, state: null });
      void addItem(routeState.addTicker, routeState.addName ?? routeState.addTicker);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingDb]);

  // Load cached analyses on mount
  useEffect(() => {
    if (loadingDb) return;
    const map: Record<string, WatchlistAnalysis> = {};
    Promise.allSettled(
      items.map(async item => {
        const cached = await getCache<{ ticker: string; companyName?: string; currentPrice?: string; verdict?: string; cyclePosition?: { score: number; stage: string } }>(item.ticker);
        if (cached?.data) {
          map[item.ticker] = {
            ticker:       item.ticker,
            companyName:  cached.data.companyName,
            currentPrice: cached.data.currentPrice,
            verdict:      cached.data.verdict,
            cycleScore:   cached.data.cyclePosition?.score,
            cycleStage:   cached.data.cyclePosition?.stage,
          };
        }
      }),
    ).then(() => setAnalyses({ ...map }));
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

  const addItem = useCallback(async (ticker: string, name: string) => {
    const t = ticker.trim().toUpperCase();
    const n = name.trim() || t;
    if (!t) return;
    if (items.some(i => i.ticker === t)) return; // already present
    const newItem: WatchlistItem = { ticker: t, name: n, addedAt: Date.now() };
    const updated = [...items, newItem];
    setItems(updated);
    await syncToDb(updated);
  }, [items, syncToDb]);

  function removeItem(ticker: string) {
    const updated = items.filter(i => i.ticker !== ticker);
    setItems(updated);
    void syncToDb(updated);
  }

  async function refreshAll() {
    if (!items.length) return;
    setRefreshing(true);
    setError(null);
    const tickers = items.map(i => i.ticker);
    const prompt = `You are a financial analyst with web search access. For each of these stock tickers: ${tickers.join(', ')}
Get the current market data and provide a quick assessment for each.
Return ONLY valid JSON (no markdown, no backticks):
{
  "stocks": [
    {
      "ticker": "exact ticker as given",
      "companyName": "Full name",
      "currentPrice": "e.g. A$38.50",
      "priceChange": "e.g. +1.2%",
      "verdict": "BUY or HOLD or SELL or NEUTRAL",
      "summary": "One sentence on current outlook.",
      "cyclePosition": { "score": 65, "stage": "early or mid or late or peak" }
    }
  ]
}
Include one entry per ticker in the same order provided. Use web search for current prices. Return ONLY the JSON.`;

    try {
      const result = await callClaude<{ stocks: (WatchlistAnalysis & { ticker: string })[] }>({
        prompt, webSearch: true, maxTokens: 2500,
      });
      const map: Record<string, WatchlistAnalysis> = {};
      (result.stocks ?? []).forEach((s, i) => {
        const originalTicker = tickers[i] ?? s.ticker;
        const bareClaude = s.ticker?.toUpperCase().replace(/\.(AX|L|US)$/,'');
        const matched = tickers.find(t => {
          const bare = t.toUpperCase().replace(/\.(AX|L|US)$/,'');
          return bare === bareClaude || t.toUpperCase() === s.ticker?.toUpperCase();
        }) ?? originalTicker;
        map[matched] = { ...s, ticker: matched };
        void putCache(matched, { ...s, ticker: matched }, 'live', 'analyser');
      });
      setAnalyses(map);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Refresh failed');
    } finally {
      setRefreshing(false);
    }
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
            disabled={refreshing}
            style={{ padding: '0.5rem 1rem', borderRadius: 8, border: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-text-muted)', fontSize: '0.8rem', cursor: refreshing ? 'not-allowed' : 'pointer', opacity: refreshing ? 0.6 : 1 }}
          >
            {refreshing ? 'Refreshing…' : '↻ Refresh all'}
          </button>
        )}
        {syncing && <span style={{ alignSelf: 'center', fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>Syncing…</span>}
      </form>

      {error && <ErrorBox message={error} />}
      {refreshing && <LoadingSpinner message="Fetching current prices for all watchlist items…" />}

      {/* ── List ────────────────────────────────────────────────────── */}
      {items.length > 0 && !refreshing && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {items.map(item => {
            const a = analyses[item.ticker];
            return (
              <WatchlistRow
                key={item.ticker}
                item={item}
                analysis={a}
                onAnalyse={() => navigate('/stock/analyse', { state: { ticker: item.ticker } })}
                onRemove={() => removeItem(item.ticker)}
              />
            );
          })}
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

// ── WatchlistRow ──────────────────────────────────────────────────────────────

function WatchlistRow({ item, analysis: a, onAnalyse, onRemove }: {
  item:      WatchlistItem;
  analysis?: WatchlistAnalysis;
  onAnalyse: () => void;
  onRemove:  () => void;
}) {
  const score = a?.cycleScore;
  const cycleAlertLevel: 'peak' | 'late' | 'buy' | null =
    score !== undefined
      ? score >= 80  ? 'peak'
      : score >= 65  ? 'late'
      : score < 40 && a?.verdict === 'BUY' ? 'buy'
      : null
      : null;

  const alertColors: Record<string, { bg: string; border: string; text: string }> = {
    peak: { bg: 'rgba(239,68,68,0.08)',  border: 'rgba(239,68,68,0.3)',  text: '#ef4444' },
    late: { bg: 'rgba(240,160,48,0.08)', border: 'rgba(240,160,48,0.3)', text: '#f0a030' },
    buy:  { bg: 'rgba(77,199,77,0.08)',  border: 'rgba(77,199,77,0.3)',  text: '#4dc74d' },
  };
  const alert = cycleAlertLevel ? alertColors[cycleAlertLevel] : null;
  const verdictColor = a?.verdict ? { BUY: '#4dc74d', HOLD: '#f0a030', SELL: '#ef4444', NEUTRAL: '#94a3b8' }[a.verdict] ?? '#94a3b8' : '#94a3b8';

  return (
    <div style={{
      background: alert ? alert.bg : 'var(--color-bg-surface)',
      border: `1px solid ${alert ? alert.border : 'var(--color-border)'}`,
      borderRadius: 10,
      padding: '0.75rem',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: '1rem',
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            onClick={onAnalyse}
            style={{ fontFamily: 'monospace', fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >{item.ticker}</button>
          <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{a?.companyName ?? item.name}</span>
          {a?.verdict && (
            <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: `${verdictColor}15`, color: verdictColor, border: `1px solid ${verdictColor}40` }}>{a.verdict}</span>
          )}
          {score !== undefined && (
            <span style={{ fontSize: '0.65rem', padding: '1px 6px', borderRadius: 4, background: alert ? `${alert.text}15` : 'rgba(255,255,255,0.06)', color: alert ? alert.text : 'var(--color-text-muted)', border: `1px solid ${alert ? alert.border : 'var(--color-border)'}` }}>
              Cycle {score} · {a?.cycleStage}
            </span>
          )}
        </div>
        {cycleAlertLevel && (
          <div style={{ fontSize: '0.72rem', color: alert!.text, marginTop: 4 }}>
            {cycleAlertLevel === 'peak' && `Score ${score} — potential peak. Consider reducing.`}
            {cycleAlertLevel === 'late' && `Score ${score} — late stage. Tighten stops.`}
            {cycleAlertLevel === 'buy'  && `Score ${score} — early cycle BUY. Accumulation opportunity.`}
          </div>
        )}
        {a?.summary && (
          <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', marginTop: 4, lineHeight: 1.4 }}>{a.summary}</div>
        )}
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        {a?.currentPrice && <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>{a.currentPrice}</div>}
        {a?.priceChange  && <div style={{ fontSize: '0.72rem', color: a.priceChange.startsWith('-') ? '#ef4444' : '#4dc74d', fontWeight: 600 }}>{a.priceChange}</div>}
        <button
          onClick={onRemove}
          style={{ marginTop: 6, fontSize: '0.65rem', padding: '1px 6px', borderRadius: 4, border: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-text-muted)', cursor: 'pointer' }}
        >
          Remove
        </button>
      </div>
    </div>
  );
}
