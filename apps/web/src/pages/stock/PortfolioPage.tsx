import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApiClient } from '../../hooks/useApiClient';
import { useClaude } from '../../hooks/useClaude';
import { useApiCache } from '../../hooks/useApiCache';
import type { PortfolioHolding } from '@transformotion/api-client';
import { SectionDivider, ErrorBox, LoadingSpinner } from './MarketPage';
import { CK, isCacheFresh } from '../../lib/cacheConfig';
import { useTabStore } from '../../store/tabStore';
import type { HoldingAnalysis } from '../../types/stock';

// ── Helpers ───────────────────────────────────────────────────────────────────

function cmcBrokerage(value: number): number {
  return Math.max(11, value * 0.00075);
}

function normaliseTicker(raw: string): string {
  let t = raw.toUpperCase().replace(/['"]/g, '').trim();
  if (t.includes(':')) {
    const [code, market] = t.split(':');
    if (market === 'US') return code;
    if (market === 'AU') return code + '.AX';
    if (market === 'GB' || market === 'UK') return code + '.L';
    return code;
  }
  if (/^[A-Z][A-Z0-9]{1,5}$/.test(t) && !t.includes('.')) return t + '.AX';
  return t;
}

function splitCSVRow(row: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (const ch of row) {
    if (ch === '"') { inQuotes = !inQuotes; }
    else if (ch === ',' && !inQuotes) { result.push(current); current = ''; }
    else { current += ch; }
  }
  result.push(current);
  return result;
}

function parseCMCCsv(text: string): PortfolioHolding[] {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];

  const header = splitCSVRow(lines[0]).map(h => h.toLowerCase().replace(/['"]/g, '').trim());
  const idx = (terms: string[]) => header.findIndex(h => terms.some(t => h.includes(t)));

  const tickerIdx    = idx(['code', 'ticker', 'instrument', 'symbol']);
  const sharesIdx    = idx(['quantity', 'units', 'shares', 'position']);
  // Per-unit purchase price column.  CMC AU uses 'open price' or 'unit open price'.
  const priceIdx     = idx(['avg cost', 'average cost', 'cost price', 'purchase price',
                            'open price', 'unit open', 'unit cost', 'book cost', 'purchase']);
  // Total position cost column (price = openCost / shares).
  // CMC AU uses 'open cost'.  Must be checked BEFORE the market-value fallback.
  const openCostIdx  = idx(['open cost', 'cost basis', 'book value']);
  // Current market value — last-resort fallback; sets priceIsCurrentNotPurchase = true.
  const valueIdx     = idx(['market value', 'current value']);

  if (tickerIdx === -1 || sharesIdx === -1) return [];

  const holdings: PortfolioHolding[] = [];
  const now = Date.now();

  for (let i = 1; i < lines.length; i++) {
    const cols = splitCSVRow(lines[i]).map(c => c.trim().replace(/^"|"$/g, ''));
    const rawTicker = cols[tickerIdx] ?? '';
    const rawShares = cols[sharesIdx] ?? '';

    if (!rawTicker || ['total', 'cash', 'totals'].includes(rawTicker.toLowerCase())) continue;

    const ticker = normaliseTicker(rawTicker);
    const shares = parseFloat(rawShares.replace(/[,$\s]/g, ''));
    if (!ticker || isNaN(shares) || shares <= 0) continue;

    let price = priceIdx !== -1 ? parseFloat((cols[priceIdx] ?? '').replace(/[,$\s]/g, '')) : NaN;

    if (isNaN(price) || price < 0) {
      // Try total open cost (open cost ÷ shares = actual avg purchase price)
      if (openCostIdx !== -1) {
        const openCost = parseFloat((cols[openCostIdx] ?? '').replace(/[,$\s]/g, ''));
        if (!isNaN(openCost) && openCost > 0 && shares > 0) {
          price = openCost / shares;
        }
      }
    }

    // If no purchase price found, default to 0 (unknown). Do NOT use market value as a
    // substitute — that produces incorrect P&L data. The user can re-import after correction.
    const avgCost = !isNaN(price) && price >= 0 ? price : 0;

    holdings.push({
      ticker,
      shares,
      avgCost,
      isGifted: avgCost === 0,
      addedAt: now,
    });
  }

  return holdings;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function PortfolioPage() {
  // ── Zustand store for cross-tab persistence ───────────────────────────────
  const storePortfolio    = useTabStore(s => s.portfolio);
  const setPortfolioStore = useTabStore(s => s.setPortfolio);

  // Initialize from store so re-mounting the tab shows data instantly
  const [holdings,       setHoldingsLocal]    = useState<PortfolioHolding[]>(storePortfolio.holdings);
  const [analyses,       setAnalysesLocal]    = useState<Record<string, HoldingAnalysis>>(storePortfolio.analyses);
  // Skip loading spinner if store already has data from a previous visit
  const [loadingDb,      setLoadingDb]        = useState(storePortfolio.holdings.length === 0);
  const [loadingTickers, setLoadingTickers]   = useState<Set<string>>(new Set());
  const [enrichProgress, setEnrichProgress]   = useState<{ msg: string; pct: number } | null>(null);
  const [syncing,        setSyncing]          = useState(false);
  const [error,          setError]            = useState<string | null>(null);
  const [confirmClear,   setConfirmClear]     = useState(false);
  const fileInputRef   = useRef<HTMLInputElement>(null);

  const api                  = useApiClient();
  const { callClaude }       = useClaude();
  const { getCache, putCache } = useApiCache();
  const navigate             = useNavigate();

  // Wrappers that keep local state and Zustand in sync.
  // Supports both direct value and functional updater forms.
  const setHoldings = useCallback((newHoldings: PortfolioHolding[]) => {
    setHoldingsLocal(newHoldings);
    setPortfolioStore({ holdings: newHoldings });
  }, [setPortfolioStore]);

  const setAnalyses = useCallback((
    updater: Record<string, HoldingAnalysis> | ((prev: Record<string, HoldingAnalysis>) => Record<string, HoldingAnalysis>),
  ) => {
    if (typeof updater === 'function') {
      setAnalysesLocal(prev => {
        const next = updater(prev);
        setPortfolioStore({ analyses: next });
        return next;
      });
    } else {
      setAnalysesLocal(updater);
      setPortfolioStore({ analyses: updater });
    }
  }, [setPortfolioStore]);

  // Load holdings on mount.
  // If store has holdings from a previous visit, loadingDb starts false → no spinner.
  useEffect(() => {
    api.getPortfolio()
      .then(r => setHoldings(r.holdings ?? []))
      .catch(() => { /* keep existing holdings */ })
      .finally(() => setLoadingDb(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);

  // ── Batch enrichment ──────────────────────────────────────────────────────

  const runAnalysis = useCallback(async (targetHoldings: PortfolioHolding[]) => {
    if (!targetHoldings.length) return;
    setError(null);

    // Phase 1: cache check — always show cached data immediately (even if stale),
    // then collect stale items for a background Claude refresh.
    const staleHoldings: PortfolioHolding[] = [];
    await Promise.allSettled(targetHoldings.map(async h => {
      const cached = await getCache<HoldingAnalysis>(CK.analysis(h.ticker));
      if (cached) {
        // Show immediately so the user sees something while Claude may refresh
        const entry = { ...cached.data, ticker: h.ticker };
        setAnalyses(prev => ({ ...prev, [h.ticker]: entry }));
        if (!isCacheFresh(cached.cachedAt, 'analyser')) {
          staleHoldings.push(h); // refresh in background
        }
      } else {
        staleHoldings.push(h); // no cache at all — need Claude
      }
    }));

    if (!staleHoldings.length) return;

    // Phase 2: per-ticker Claude calls.
    // A single batch call for many tickers with web search exceeds the API Gateway
    // 29-second timeout. Per-ticker calls stay within the limit and allow progress
    // to update after each one completes.
    const n = staleHoldings.length;
    setEnrichProgress({ msg: `Enriching ${n} holding${n !== 1 ? 's' : ''}…`, pct: 5 });
    setLoadingTickers(new Set(staleHoldings.map(h => h.ticker)));

    for (let i = 0; i < staleHoldings.length; i++) {
      const h = staleHoldings[i];
      const pct = Math.round(5 + (i / n) * 90);
      setEnrichProgress({ msg: `Analysing ${h.ticker} (${i + 1} of ${n})…`, pct });

      const prompt = `Financial analyst with web search. For ticker: ${h.ticker}
Get current market data. If USD-priced, apply current AUD/USD exchange rate to provide currentPriceAUD in AUD.
Return ONLY valid JSON. No markdown, no XML tags, no citation tags in any field value:
{"ticker":"${h.ticker}","companyName":"Full name","exchange":"ASX|NASDAQ|NYSE|LSE","type":"Stock or ETF","currentPrice":"e.g. A$38.50 or US$625.00","currentPriceAUD":38.50,"priceChange":"e.g. +1.2%","verdict":"BUY|HOLD|SELL|NEUTRAL","verdictReason":"One sentence.","cycleScore":65,"cycleStage":"early|mid|late|peak"}
Use web search for current price.`;

      try {
        const result = await callClaude<HoldingAnalysis>({ prompt, webSearch: true, maxTokens: 400 });
        const analysis: HoldingAnalysis = { ...result, ticker: h.ticker };
        setAnalyses(prev => ({ ...prev, [h.ticker]: analysis }));
        await putCache(CK.analysis(h.ticker), analysis, 'live', 'analyser');
        if (analysis.cycleScore !== undefined) {
          void putCache(CK.cycle(h.ticker), { cycleScore: analysis.cycleScore, cycleStage: analysis.cycleStage }, 'live', 'cycle');
        }
      } catch {
        // One ticker failing should not block the rest — leave it showing stale/no data
      }

      setLoadingTickers(prev => { const next = new Set(prev); next.delete(h.ticker); return next; });
      setEnrichProgress({ msg: `Analysing ${h.ticker} (${i + 1} of ${n})…`, pct: Math.round(5 + (i + 1) / n * 90) });
    }

    setEnrichProgress(null);
    setLoadingTickers(new Set());
  }, [callClaude, getCache, putCache, setAnalyses]);

  // Hydrate from DDB then enrich only what's missing.
  // Step 1 (sync): read all cached analyses from DDB — show stale data immediately rather than nothing.
  // Step 2 (after hydration): call Claude only for holdings with NO cache entry at all.
  useEffect(() => {
    if (loadingDb || holdings.length === 0) return;
    const uncached: PortfolioHolding[] = [];
    void Promise.allSettled(
      holdings.map(async h => {
        const cached = await getCache<HoldingAnalysis>(CK.analysis(h.ticker));
        if (cached?.data) {
          setAnalyses(prev => ({ ...prev, [h.ticker]: { ...cached.data, ticker: h.ticker } }));
        } else {
          uncached.push(h);
        }
      })
    ).then(() => {
      if (uncached.length > 0) void runAnalysis(uncached);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingDb]); // Fires once per DDB load; holdings/analyses not watched to prevent loops

  const syncToDb = useCallback(async (newHoldings: PortfolioHolding[]) => {
    setSyncing(true);
    try {
      await api.putPortfolio({ holdings: newHoldings });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sync failed');
    } finally {
      setSyncing(false);
    }
  }, [api]);

  function handleFileImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async ev => {
      const text = ev.target?.result as string;
      const parsed = parseCMCCsv(text);
      if (!parsed.length) {
        setError('No holdings found in CSV. Make sure you exported a Profit & Loss report from CMC Markets.');
        return;
      }
      setError(null);
      setHoldings(parsed);
      await syncToDb(parsed);
      await runAnalysis(parsed);
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  function removeHolding(ticker: string) {
    const updated = holdings.filter(h => h.ticker !== ticker);
    setHoldings(updated);
    void syncToDb(updated);
  }

  function handleClearAll() {
    if (!confirmClear) {
      setConfirmClear(true);
      setTimeout(() => setConfirmClear(false), 3000);
      return;
    }
    setHoldings([]);
    setAnalyses({});
    void syncToDb([]);
    setConfirmClear(false);
  }

  // ── Portfolio totals ──────────────────────────────────────────────────────

  // Gifted holdings excluded from cost basis
  const totalCost = holdings.reduce((sum, h) => {
    if (h.isGifted) return sum;
    return sum + h.shares * h.avgCost;
  }, 0);
  const totalCurrentValue = holdings.reduce((sum, h) => {
    const price = analyses[h.ticker]?.currentPriceAUD;
    return price !== undefined ? sum + h.shares * price : sum;
  }, 0);
  const hasCurrentPrices = holdings.some(h => analyses[h.ticker]?.currentPriceAUD !== undefined);
  const totalPnL    = totalCurrentValue - totalCost;
  const totalPnLPct = totalCost > 0 ? (totalPnL / totalCost) * 100 : 0;

  if (loadingDb) return <LoadingSpinner message="Loading portfolio…" />;

  const isEnriching = enrichProgress !== null;

  return (
    <div style={{ maxWidth: 960, margin: '0 auto' }}>

      {/* ── Toolbar ─────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isEnriching}
          style={{ padding: '0.375rem 1rem', borderRadius: 6, border: '1px solid var(--color-accent)', background: 'rgba(77,159,255,0.15)', color: 'var(--color-accent)', fontSize: '0.8rem', fontWeight: 600, cursor: isEnriching ? 'not-allowed' : 'pointer', opacity: isEnriching ? 0.5 : 1 }}
        >
          Import CSV
        </button>
        <input ref={fileInputRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleFileImport} />

        {holdings.length > 0 && (
          <>
            <button
              onClick={() => void runAnalysis(holdings)}
              disabled={isEnriching}
              style={{ padding: '0.375rem 1rem', borderRadius: 6, border: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-text-muted)', fontSize: '0.8rem', cursor: isEnriching ? 'not-allowed' : 'pointer', opacity: isEnriching ? 0.6 : 1 }}
            >
              {isEnriching ? 'Analysing…' : '↻ Refresh all'}
            </button>
            <button
              onClick={handleClearAll}
              style={{ padding: '0.375rem 1rem', borderRadius: 6, border: `1px solid ${confirmClear ? '#ef4444' : 'var(--color-border)'}`, background: confirmClear ? 'rgba(239,68,68,0.15)' : 'transparent', color: confirmClear ? '#ef4444' : 'var(--color-text-muted)', fontSize: '0.8rem', cursor: 'pointer' }}
            >
              {confirmClear ? 'Tap again to confirm' : 'Clear all'}
            </button>
          </>
        )}

        {syncing && <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>Syncing…</span>}
      </div>

      {error && <ErrorBox message={error} />}

      {/* ── Inline progress bar (shown while enriching, cards stay visible) ── */}
      {isEnriching && enrichProgress && (
        <div style={{ marginBottom: '1rem', padding: '0.75rem 1rem', background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', borderRadius: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>{enrichProgress.msg}</span>
            <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>{enrichProgress.pct}%</span>
          </div>
          <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${enrichProgress.pct}%`, background: 'var(--color-accent)', borderRadius: 2, transition: 'width 0.3s ease' }} />
          </div>
        </div>
      )}

      {/* ── Portfolio summary + holdings ─────────────────────────────── */}
      {holdings.length > 0 && (
        <div>
          {/* Summary strip */}
          <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap', alignItems: 'center', padding: '0.75rem 1rem', background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', borderRadius: 10, marginBottom: '1rem' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 600, marginRight: 4 }}>
              {holdings.length} holding{holdings.length !== 1 ? 's' : ''}
            </div>
            <SummaryCell label="Cost basis" value={`A$${totalCost.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} />
            {hasCurrentPrices && (
              <>
                <SummaryCell label="Current value" value={`A$${totalCurrentValue.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} />
                <SummaryCell
                  label="Total P&L"
                  value={`${totalPnL >= 0 ? '+' : ''}A$${Math.abs(totalPnL).toLocaleString('en-AU', { maximumFractionDigits: 0 })}  (${totalPnLPct >= 0 ? '+' : ''}${totalPnLPct.toFixed(1)}%)`}
                  color={totalPnL >= 0 ? '#4dc74d' : '#ef4444'}
                />
              </>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.5rem' }}>
            {holdings.map(h => (
              <HoldingRow
                key={h.ticker}
                holding={h}
                analysis={analyses[h.ticker]}
                isLoading={loadingTickers.has(h.ticker)}
                onAnalyse={() => navigate('/stock/analyse', { state: { ticker: h.ticker } })}
                onRemove={() => removeHolding(h.ticker)}
              />
            ))}
          </div>

          <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', lineHeight: 1.6 }}>
            Brokerage estimates use CMC Markets AU rates (min A$11 or 0.075%). Not financial advice.
          </div>
        </div>
      )}

      {/* ── Empty state ──────────────────────────────────────────────── */}
      {holdings.length === 0 && !isEnriching && !error && (
        <div style={{ textAlign: 'center', padding: '4rem 1rem', color: 'var(--color-text-muted)' }}>
          <div style={{ fontSize: '0.875rem', maxWidth: 400, margin: '0 auto 1.5rem', lineHeight: 1.6 }}>
            Import your holdings from a CMC Markets Profit &amp; Loss CSV export to see cycle alerts, P&amp;L, and buy/sell signals.
          </div>
          <button
            onClick={() => fileInputRef.current?.click()}
            style={{ padding: '0.5rem 1.25rem', borderRadius: 8, border: '1px solid var(--color-accent)', background: 'rgba(77,159,255,0.15)', color: 'var(--color-accent)', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer' }}
          >
            Import CSV
          </button>
        </div>
      )}
    </div>
  );
}

// ── SummaryCell ───────────────────────────────────────────────────────────────

function SummaryCell({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ fontSize: '0.75rem' }}>
      <div style={{ color: 'var(--color-text-muted)', marginBottom: 1 }}>{label}</div>
      <div style={{ fontWeight: 600, color: color ?? 'var(--color-text-primary)' }}>{value}</div>
    </div>
  );
}

// ── CycleGauge ────────────────────────────────────────────────────────────────

function CycleGauge({ score, stage }: { score: number; stage?: string }) {
  const color = score >= 80 ? '#ef4444' : score >= 65 ? '#f0a030' : score < 40 ? '#4dc74d' : '#94a3b8';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
      <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ width: `${Math.min(100, Math.max(0, score))}%`, height: '100%', background: color, borderRadius: 2, transition: 'width 0.4s' }} />
      </div>
      <span style={{ fontSize: '0.65rem', color, fontWeight: 700, minWidth: 18, textAlign: 'right' }}>{score}</span>
      {stage && <span style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', textTransform: 'capitalize' }}>{stage}</span>}
    </div>
  );
}

// ── StatCell ──────────────────────────────────────────────────────────────────

function StatCell({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ fontSize: '0.68rem' }}>
      <div style={{ color: 'var(--color-text-muted)', marginBottom: 1 }}>{label}</div>
      <div style={{ fontWeight: 600, color: color ?? 'var(--color-text-primary)', fontSize: '0.72rem' }}>{value}</div>
    </div>
  );
}

// ── SkeletonBar ───────────────────────────────────────────────────────────────

function SkeletonBar({ width = '100%', height = 12 }: { width?: string | number; height?: number }) {
  return (
    <div
      className="pulse-loading"
      style={{ width, height, borderRadius: 4, background: 'rgba(255,255,255,0.08)' }}
    />
  );
}

// ── HoldingRow ────────────────────────────────────────────────────────────────

function HoldingRow({ holding: h, analysis: a, isLoading, onAnalyse, onRemove }: {
  holding:   PortfolioHolding;
  analysis?: HoldingAnalysis;
  isLoading: boolean;
  onAnalyse: () => void;
  onRemove:  () => void;
}) {
  const isGifted   = h.isGifted;
  const costBasis  = h.shares * h.avgCost;
  const currentVal = a?.currentPriceAUD !== undefined ? h.shares * a.currentPriceAUD : undefined;
  const pnlDollar  = currentVal !== undefined ? currentVal - costBasis : undefined;
  const pnlPct     = isGifted
    ? (currentVal !== undefined ? 100 : undefined)
    : (costBasis > 0 && pnlDollar !== undefined ? (pnlDollar / costBasis) * 100 : undefined);
  const pnlUp      = pnlDollar !== undefined ? pnlDollar >= 0 : undefined;

  const brokerageBase = currentVal ?? costBasis;
  const brokerage     = cmcBrokerage(brokerageBase);
  const netProceeds   = brokerageBase - brokerage;

  const score = a?.cycleScore;
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

  const fmtAud = (n: number) =>
    `A$${n.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // ── Skeleton state — enrichment in progress ──────────────────────────────
  if (isLoading && !a) {
    return (
      <div style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', borderRadius: 10, padding: '0.875rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontFamily: 'monospace', fontSize: '0.9rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>{h.ticker}</span>
            <SkeletonBar width={100} height={14} />
          </div>
          <SkeletonBar width={60} height={14} />
        </div>
        <SkeletonBar width="100%" height={4} />
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.625rem' }}>
          <StatCell
            label={`${h.shares.toLocaleString()} shares`}
            value={isGifted ? 'Avg cost: Gifted' : `Avg cost: ${fmtAud(h.avgCost)}`}
          />
          <StatCell label="Cost basis" value={isGifted ? '—' : fmtAud(costBasis)} />
        </div>
      </div>
    );
  }

  return (
    <div style={{
      background:   alert ? alert.bg    : 'var(--color-bg-surface)',
      border:       `1px solid ${alert ? alert.border : 'var(--color-border)'}`,
      borderRadius: 10,
      padding:      '0.875rem',
    }}>

      {/* ── Header: ticker / company / badges / current price ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', marginBottom: '0.375rem' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
            <span style={{ fontFamily: 'monospace', fontSize: '0.9rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
              {h.ticker}
            </span>
            {a?.companyName && (
              <span style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>{a.companyName}</span>
            )}
            {a?.exchange && (
              <span style={{ fontSize: '0.62rem', color: 'var(--color-text-muted)', padding: '1px 5px', borderRadius: 3, border: '1px solid var(--color-border)' }}>
                {a.exchange}
              </span>
            )}
            {isGifted && (
              <span style={{ fontSize: '0.62rem', fontWeight: 600, padding: '1px 6px', borderRadius: 4, background: 'rgba(77,159,255,0.15)', color: 'var(--color-accent)', border: '1px solid rgba(77,159,255,0.3)' }}>
                Gifted
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

        {/* Current price */}
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

      {/* ── Cycle gauge ── */}
      {score !== undefined && <CycleGauge score={score} stage={a?.cycleStage} />}

      {/* ── Alert message ── */}
      {cycleAlertLevel && (
        <div style={{ fontSize: '0.75rem', color: alert!.text, marginTop: '0.375rem', fontWeight: 500 }}>
          {cycleAlertLevel === 'peak' && (
            <>▼ Consider selling — estimated net proceeds after brokerage: <strong>{fmtAud(netProceeds)}</strong> (est. {fmtAud(brokerage)} brokerage)</>
          )}
          {cycleAlertLevel === 'late' && <>⚠ Late stage — tighten stops (cycle score {score})</>}
          {cycleAlertLevel === 'buy'  && <>▲ Accumulation opportunity (cycle score {score})</>}
        </div>
      )}

      {/* ── Stats grid: shares / cost basis / current value / P&L ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '0.5rem', marginTop: '0.625rem', padding: '0.5rem 0.75rem', background: 'rgba(255,255,255,0.03)', borderRadius: 6 }}>
        <StatCell
          label={`${h.shares.toLocaleString()} shares`}
          value={isGifted ? 'Avg cost: Gifted' : `Avg cost: ${fmtAud(h.avgCost)}`}
        />
        <StatCell
          label="Cost basis"
          value={isGifted ? '—' : fmtAud(costBasis)}
        />
        {currentVal !== undefined && (
          <StatCell label="Current value" value={fmtAud(currentVal)} />
        )}
        {pnlDollar !== undefined && pnlPct !== undefined && (
          <StatCell
            label="P&L"
            value={`${pnlUp ? '+' : ''}${fmtAud(pnlDollar)} (${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(1)}%)`}
            color={pnlUp ? '#4dc74d' : '#ef4444'}
          />
        )}
      </div>

      {/* ── Actions ── */}
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.625rem' }}>
        <button
          onClick={onAnalyse}
          style={{ fontSize: '0.72rem', padding: '4px 10px', borderRadius: 5, border: '1px solid var(--color-accent)', background: 'rgba(77,159,255,0.12)', color: 'var(--color-accent)', cursor: 'pointer', fontWeight: 600 }}
        >
          Full analysis
        </button>
        <button
          onClick={onRemove}
          style={{ fontSize: '0.72rem', padding: '4px 10px', borderRadius: 5, border: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-text-muted)', cursor: 'pointer' }}
        >
          Remove
        </button>
      </div>
    </div>
  );
}

export { SectionDivider };
