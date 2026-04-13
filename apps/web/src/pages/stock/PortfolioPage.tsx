import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApiClient } from '../../hooks/useApiClient';
import { useClaude } from '../../hooks/useClaude';
import { useApiCache } from '../../hooks/useApiCache';
import type { PortfolioHolding } from '@transformotion/api-client';
import { SectionDivider, ErrorBox, LoadingSpinner } from './MarketPage';

// ── Types ─────────────────────────────────────────────────────────────────────

interface HoldingAnalysis {
  ticker:       string;
  companyName?: string;
  currentPrice?:string;
  priceChange?: string;
  verdict?:     string;
  summary?:     string;
  cycleScore?:  number;
  cycleStage?:  string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** CMC brokerage estimate: min A$11 or 0.075% */
function cmcBrokerage(value: number): number {
  return Math.max(11, value * 0.00075);
}

/** Normalise a raw ticker from CMC CSV export */
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

/** Parse a CMC Markets Profit & Loss CSV into PortfolioHolding[]. */
function parseCMCCsv(text: string): PortfolioHolding[] {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];

  const header = splitCSVRow(lines[0]).map(h => h.toLowerCase().replace(/['"]/g, '').trim());

  const idx = (terms: string[]) => header.findIndex(h => terms.some(t => h.includes(t)));

  const tickerIdx  = idx(['code', 'ticker', 'instrument', 'symbol']);
  const sharesIdx  = idx(['quantity', 'units', 'shares', 'position']);
  const priceIdx   = idx(['avg cost', 'average cost', 'cost price', 'purchase']);
  const valueIdx   = idx(['market value', 'value']);

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
    let priceIsCurrentNotPurchase = false;

    if (isNaN(price) || price < 0) {
      if (valueIdx !== -1) {
        const val = parseFloat((cols[valueIdx] ?? '').replace(/[,$\s]/g, ''));
        if (!isNaN(val) && val > 0) {
          price = val / shares;
          priceIsCurrentNotPurchase = true;
        }
      }
    }

    holdings.push({
      ticker,
      shares,
      purchasePrice: isNaN(price) ? 0 : price,
      addedAt: now,
      priceIsCurrentNotPurchase: priceIsCurrentNotPurchase || undefined,
    });
  }

  return holdings;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function PortfolioPage() {
  const [holdings,  setHoldings]  = useState<PortfolioHolding[]>([]);
  const [analyses,  setAnalyses]  = useState<Record<string, HoldingAnalysis>>({});
  const [loadingDb, setLoadingDb] = useState(true);
  const [syncing,   setSyncing]   = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const api      = useApiClient();
  const { callClaude } = useClaude();
  const { getCache, putCache } = useApiCache();
  const navigate = useNavigate();

  // Load holdings from DynamoDB on mount
  useEffect(() => {
    api.getPortfolio()
      .then(r => setHoldings(r.holdings ?? []))
      .catch(() => setHoldings([]))
      .finally(() => setLoadingDb(false));
  }, [api]);

  // Load cached analyses from DynamoDB on mount
  useEffect(() => {
    if (loadingDb) return;
    const map: Record<string, HoldingAnalysis> = {};
    Promise.allSettled(
      holdings.map(async h => {
        const cached = await getCache<{ ticker: string; companyName?: string; currentPrice?: string; verdict?: string; cyclePosition?: { score: number; stage: string } }>(h.ticker);
        if (cached?.data) {
          map[h.ticker] = {
            ticker:       h.ticker,
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
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  async function refreshAll() {
    if (!holdings.length) return;
    setRefreshing(true);
    setError(null);
    const tickers = holdings.map(h => h.ticker);
    const prompt = `You are a financial analyst with web search access. For each of these stock tickers: ${tickers.join(', ')}
Get the current market data and provide a quick assessment for each.
Return ONLY valid JSON (no markdown, no backticks):
{
  "stocks": [
    {
      "ticker": "exact ticker as given",
      "companyName": "Full name",
      "exchange": "e.g. ASX, NASDAQ, NYSE, LSE",
      "currentPrice": "e.g. A$38.50 or US$625.00",
      "priceChange": "e.g. +1.2% or -0.4%",
      "verdict": "BUY or HOLD or SELL or NEUTRAL",
      "verdictReason": "One concise sentence",
      "summary": "One sentence on current outlook.",
      "cyclePosition": { "score": 65, "stage": "early or mid or late or peak" },
      "dataNote": "As of [date]"
    }
  ]
}
Include one entry per ticker in the same order provided. Use web search for current prices. Return ONLY the JSON.`;

    try {
      const result = await callClaude<{ stocks: (HoldingAnalysis & { ticker: string })[] }>({
        prompt, webSearch: true, maxTokens: 3000,
      });
      const map: Record<string, HoldingAnalysis> = {};
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

  // Portfolio totals
  const totalCost  = holdings.reduce((sum, h) => sum + h.shares * h.purchasePrice, 0);

  if (loadingDb) return <LoadingSpinner message="Loading portfolio…" />;

  return (
    <div style={{ maxWidth: 960, margin: '0 auto' }}>

      {/* ── Toolbar ─────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <button
          onClick={() => fileInputRef.current?.click()}
          style={{ padding: '0.375rem 1rem', borderRadius: 6, border: '1px solid var(--color-accent)', background: 'rgba(77,159,255,0.15)', color: 'var(--color-accent)', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}
        >
          Import CSV
        </button>
        <input ref={fileInputRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleFileImport} />

        {holdings.length > 0 && (
          <>
            <button
              onClick={refreshAll}
              disabled={refreshing}
              style={{ padding: '0.375rem 1rem', borderRadius: 6, border: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-text-muted)', fontSize: '0.8rem', cursor: refreshing ? 'not-allowed' : 'pointer', opacity: refreshing ? 0.6 : 1 }}
            >
              {refreshing ? 'Refreshing…' : '↻ Refresh all'}
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
      {refreshing && <LoadingSpinner message="Fetching current prices and assessments for all holdings…" />}

      {/* ── Holdings table ───────────────────────────────────────────── */}
      {holdings.length > 0 && !refreshing && (
        <div>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '0.75rem' }}>
            {holdings.length} holding{holdings.length !== 1 ? 's' : ''} · Cost basis A${totalCost.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.5rem' }}>
            {holdings.map(h => (
              <HoldingRow
                key={h.ticker}
                holding={h}
                analysis={analyses[h.ticker]}
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
      {holdings.length === 0 && !error && (
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

// ── HoldingRow ────────────────────────────────────────────────────────────────

function HoldingRow({ holding: h, analysis: a, onAnalyse, onRemove }: {
  holding:  PortfolioHolding;
  analysis?: HoldingAnalysis;
  onAnalyse: () => void;
  onRemove:  () => void;
}) {
  const costBasis   = h.shares * h.purchasePrice;
  const brokerage   = cmcBrokerage(costBasis);

  // Cycle alert level
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
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>

        {/* Left: ticker info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button
              onClick={onAnalyse}
              style={{ fontFamily: 'monospace', fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >{h.ticker}</button>
            {a?.companyName && <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{a.companyName}</span>}
            {a?.verdict && (
              <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: `${verdictColor}15`, color: verdictColor, border: `1px solid ${verdictColor}40` }}>{a.verdict}</span>
            )}
            {score !== undefined && (
              <span style={{ fontSize: '0.65rem', padding: '1px 6px', borderRadius: 4, background: alert ? `${alert.text}15` : 'rgba(255,255,255,0.06)', color: alert ? alert.text : 'var(--color-text-muted)', border: `1px solid ${alert ? alert.border : 'var(--color-border)'}` }}>
                Cycle {score} · {a?.cycleStage}
              </span>
            )}
          </div>

          {/* Cycle alert message */}
          {cycleAlertLevel && (
            <div style={{ fontSize: '0.75rem', color: alert!.text, marginTop: 4 }}>
              {cycleAlertLevel === 'peak' && `Score ${score} — multiple peak indicators active. Sell proceeds: A$${(costBasis - brokerage).toLocaleString('en-AU', { maximumFractionDigits: 0 })} after est. A$${brokerage.toFixed(0)} brokerage.`}
              {cycleAlertLevel === 'late' && `Score ${score} — late stage, tighten stops and monitor closely.`}
              {cycleAlertLevel === 'buy'  && `Score ${score} — early cycle with BUY verdict. Accumulation opportunity.`}
            </div>
          )}

          {a?.summary && (
            <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', marginTop: 4, lineHeight: 1.4 }}>{a.summary}</div>
          )}
        </div>

        {/* Right: price + holdings */}
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          {a?.currentPrice && (
            <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>{a.currentPrice}</div>
          )}
          {a?.priceChange && (
            <div style={{ fontSize: '0.72rem', color: a.priceChange.startsWith('-') ? '#ef4444' : '#4dc74d', fontWeight: 600 }}>{a.priceChange}</div>
          )}
          <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', marginTop: 4 }}>
            {h.shares.toLocaleString()} shares
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>
            {h.priceIsCurrentNotPurchase ? 'Current' : 'Cost'} A${h.purchasePrice.toFixed(2)}
          </div>
          <button
            onClick={onRemove}
            style={{ marginTop: 4, fontSize: '0.65rem', padding: '1px 6px', borderRadius: 4, border: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-text-muted)', cursor: 'pointer' }}
          >
            Remove
          </button>
        </div>
      </div>
    </div>
  );
}
