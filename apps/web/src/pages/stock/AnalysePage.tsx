import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useClaude } from '../../hooks/useClaude';
import { useApiCache } from '../../hooks/useApiCache';
import { useMode } from '../../contexts/ModeContext';
import { ModeToggle } from '../../components/stock/ModeToggle';
import { CycleGauge } from '../../components/stock/CycleGauge';
import { SectionDivider, ErrorBox, LoadingSpinner, Footnote } from './MarketPage';
import type { CyclePosition } from '@transformotion/cycle-engine';

// ── Types ─────────────────────────────────────────────────────────────────────

interface SignalItem {
  value:  string;
  signal: 'bull' | 'bear' | 'neutral';
  note:   string;
}

interface AnalysisData {
  ticker:       string;
  companyName:  string;
  exchange:     string;
  type:         string;
  verdict:      'BUY' | 'HOLD' | 'SELL' | 'NEUTRAL';
  verdictReason:string;
  currentPrice: string;
  priceChange:  string;
  cyclePosition?: CyclePosition;
  signals: {
    rsi:          SignalItem;
    movingAverage:SignalItem;
    macd:         SignalItem;
    volume:       SignalItem;
    pe:           SignalItem;
    roe:          SignalItem;
    debtEquity:   SignalItem;
    fcfYield:     SignalItem;
  };
  summary:    string;
  keyRisks:   string[];
  dataNote:   string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const VERDICT_COLORS: Record<string, string> = { BUY: '#4dc74d', HOLD: '#f0a030', SELL: '#ef4444', NEUTRAL: '#94a3b8' };
const VERDICT_ICONS:  Record<string, string> = { BUY: '▲', SELL: '▼', HOLD: '◆', NEUTRAL: '—' };
const SIGNAL_COLORS:  Record<string, string> = { bull: '#4dc74d', bear: '#ef4444', neutral: '#94a3b8' };

const SIGNAL_DEFS = [
  { key: 'rsi',           label: 'RSI'                    },
  { key: 'movingAverage', label: 'Moving averages'        },
  { key: 'macd',          label: 'MACD'                   },
  { key: 'volume',        label: 'Volume'                 },
  { key: 'pe',            label: 'P/E ratio'              },
  { key: 'roe',           label: 'ROE / Expense ratio'    },
  { key: 'debtEquity',    label: 'Debt / equity'          },
  { key: 'fcfYield',      label: 'FCF / Distribution yield'},
] as const;

function looksLikeTicker(s: string): boolean {
  return /^[A-Z0-9.:]{1,10}$/.test(s.trim().toUpperCase());
}

// ── Component ─────────────────────────────────────────────────────────────────

export function AnalysePage() {
  const location   = useLocation();
  const navigate   = useNavigate();
  const routeState = location.state as { ticker?: string } | null;

  const [inputValue, setInputValue] = useState(routeState?.ticker ?? '');
  const [data,       setData]       = useState<AnalysisData | null>(null);
  const [cachedAt,   setCachedAt]   = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  const { callClaude, loading, error } = useClaude();
  const { getCache, putCache }         = useApiCache();
  const { isLive }                     = useMode();

  // If navigated to with a ticker (from recs/ETFs/metals), auto-analyse
  useEffect(() => {
    if (routeState?.ticker) {
      navigate('/stock/analyse', { replace: true, state: null });
      void runAnalysis(routeState.ticker, false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const buildPrompt = useCallback((ticker: string, extraNote?: string): string => {
    const liveNote = isLive
      ? `IMPORTANT: First verify via web search which company currently trades under ${ticker} — tickers can change hands or be re-listed. Do not rely solely on training data for ticker ownership.`
      : '';
    return `You are a financial analyst. ${extraNote ?? ''} Analyse the ticker "${ticker}" (could be a stock or ETF)${isLive ? ' using current data from web search' : ''}.
${liveNote}
Return ONLY valid JSON (no markdown, no backticks):
{
  "ticker": "${ticker}",
  "companyName": "Full name",
  "exchange": "Exchange e.g. ASX, NASDAQ, NYSE, LSE",
  "type": "Stock or ETF",
  "verdict": "BUY or HOLD or SELL or NEUTRAL",
  "verdictReason": "One concise sentence",
  "currentPrice": "e.g. A$28.50",
  "priceChange": "e.g. +1.4%",
  "cyclePosition": {
    "score": 65,
    "stage": "early or mid or late or peak",
    "rsiDivergence": "none or bullish or bearish",
    "macdMomentum": "strengthening or weakening or flat",
    "volumeTrend": "confirming or diverging or neutral",
    "weekHigh52Pct": 87,
    "signals": [
      { "type": "warn or danger or ok", "text": "One sentence observation." }
    ],
    "summary": "One sentence overall cycle assessment."
  },
  "signals": {
    "rsi":          { "value": "e.g. 52.4",           "signal": "bull or bear or neutral", "note": "Interpretation" },
    "movingAverage":{ "value": "e.g. Above 50-day MA", "signal": "bull or bear or neutral", "note": "Interpretation" },
    "macd":         { "value": "e.g. Bullish crossover","signal": "bull or bear or neutral", "note": "Interpretation" },
    "volume":       { "value": "e.g. 15% above avg",  "signal": "bull or bear or neutral", "note": "Interpretation" },
    "pe":           { "value": "e.g. 14.2x",          "signal": "bull or bear or neutral", "note": "Context" },
    "roe":          { "value": "e.g. 12.8%",           "signal": "bull or bear or neutral", "note": "Interpretation" },
    "debtEquity":   { "value": "e.g. 0.62",           "signal": "bull or bear or neutral", "note": "Interpretation" },
    "fcfYield":     { "value": "e.g. 5.1%",           "signal": "bull or bear or neutral", "note": "Interpretation" }
  },
  "summary": "2-3 sentence summary of current situation and outlook.",
  "keyRisks": ["Risk 1", "Risk 2", "Risk 3"],
  "dataNote": "Data as of [date], source [source]"
}
cyclePosition.score is 0-100 where 0=early move, 50=mid trend, 80=late stage, 100=peak/reversal risk. weekHigh52Pct is how close current price is to 52-week high (0-100).`;
  }, [isLive]);

  const runAnalysis = useCallback(async (ticker: string, forceRefresh: boolean, extraNote?: string) => {
    const t = ticker.trim().toUpperCase();
    if (!t) return;

    if (!forceRefresh && !extraNote) {
      const cached = await getCache<AnalysisData>(t);
      if (cached) {
        setData(cached.data);
        setCachedAt(cached.cachedAt);
        return;
      }
    }

    const prompt = buildPrompt(t, extraNote);
    const result = await callClaude<AnalysisData>({ prompt, webSearch: isLive });
    setData(result);
    setCachedAt(new Date().toISOString());
    await putCache(t, result, isLive ? 'live' : 'fast', 'analyser');
  }, [buildPrompt, callClaude, getCache, putCache, isLive]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const t = inputValue.trim();
    if (!t) return;
    if (!looksLikeTicker(t)) {
      // Company name search — resolve first
      resolveCompanyName(t);
      return;
    }
    void runAnalysis(t, false);
  }

  async function resolveCompanyName(name: string) {
    const prompt = `You are a financial analyst. The user typed "${name}" which looks like a company name rather than a ticker.
Find up to 3 companies matching this name and return ONLY valid JSON:
{
  "matches": [
    { "ticker": "e.g. CBA.AX", "companyName": "Commonwealth Bank of Australia", "exchange": "ASX" }
  ]
}
If no match found, return { "matches": [] }. Return ONLY the JSON.`;
    try {
      const result = await callClaude<{ matches: { ticker: string; companyName: string; exchange: string }[] }>({
        prompt, webSearch: isLive,
      });
      const listed = (result.matches ?? []).filter(m => m.ticker);
      if (listed.length === 1) {
        setInputValue(listed[0].ticker);
        void runAnalysis(listed[0].ticker, false);
      } else if (listed.length > 1) {
        // Show picker — for now just use the first match
        setInputValue(listed[0].ticker);
        void runAnalysis(listed[0].ticker, false);
      }
    } catch { /* error already shown */ }
  }

  function handleWrongCompany() {
    if (!data) return;
    const note = `IMPORTANT: This ticker may have recently changed hands or been re-listed. Verify via web search who currently trades under ${data.ticker} before analysing.`;
    void runAnalysis(data.ticker, true, note);
  }

  function handleAddToWatchlist() {
    if (!data) return;
    navigate('/stock/watchlist', { state: { addTicker: data.ticker, addName: data.companyName } });
  }

  const verdictColor = data ? (VERDICT_COLORS[data.verdict] ?? '#94a3b8') : '#94a3b8';

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>

      {/* ── Search bar ──────────────────────────────────────────────── */}
      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          ref={inputRef}
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          placeholder="Ticker (e.g. BHP.AX) or company name"
          style={{
            flex: 1,
            minWidth: 200,
            padding: '0.5rem 0.875rem',
            borderRadius: 8,
            border: '1px solid var(--color-border)',
            background: 'var(--color-bg-surface)',
            color: 'var(--color-text-primary)',
            fontSize: '0.875rem',
            outline: 'none',
          }}
        />
        <button
          type="submit"
          disabled={loading || !inputValue.trim()}
          style={{ padding: '0.5rem 1.25rem', borderRadius: 8, border: '1px solid var(--color-accent)', background: 'rgba(77,159,255,0.15)', color: 'var(--color-accent)', fontSize: '0.875rem', fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1 }}
        >
          {loading ? 'Analysing…' : 'Analyse'}
        </button>
        <ModeToggle />
        {data && (
          <button
            type="button"
            onClick={() => void runAnalysis(data.ticker, true)}
            disabled={loading}
            style={{ padding: '0.5rem 0.875rem', borderRadius: 8, border: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-text-muted)', fontSize: '0.8rem', cursor: 'pointer' }}
          >
            ↻
          </button>
        )}
      </form>

      {error && <ErrorBox message={error} />}
      {loading && <LoadingSpinner message={`Analysing ${inputValue.trim().toUpperCase() || '…'}`} />}

      {/* ── Analysis result ──────────────────────────────────────────── */}
      {data && !loading && (
        <div>
          {cachedAt && (
            <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', marginBottom: '0.75rem' }}>
              Cached {new Date(cachedAt).toLocaleTimeString()}
            </div>
          )}

          {/* Stock header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', gap: '1rem', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: 2 }}>
                {data.ticker} · {data.exchange}{data.type ? ` · ${data.type}` : ''}
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 4 }}>{data.companyName}</div>
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'baseline' }}>
                <span style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>{data.currentPrice}</span>
                <span style={{ fontSize: '0.875rem', color: data.priceChange?.startsWith('-') ? '#ef4444' : '#4dc74d', fontWeight: 600 }}>{data.priceChange}</span>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.5rem' }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: '0.375rem',
                padding: '0.375rem 0.875rem', borderRadius: 8,
                background: `${verdictColor}20`, border: `1px solid ${verdictColor}50`,
                color: verdictColor, fontSize: '0.875rem', fontWeight: 700,
              }}>
                {VERDICT_ICONS[data.verdict] ?? '•'} {data.verdict}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', maxWidth: 200, textAlign: 'right', lineHeight: 1.4 }}>{data.verdictReason}</div>
              <button
                onClick={handleWrongCompany}
                style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-text-muted)', cursor: 'pointer' }}
              >
                Wrong company?
              </button>
            </div>
          </div>

          {/* Cycle gauge */}
          {data.cyclePosition && (
            <>
              <SectionDivider label="Cycle position" />
              <div style={{ marginBottom: '1.5rem' }}>
                <CycleGauge cp={data.cyclePosition} />
              </div>
            </>
          )}

          {/* Chart placeholder — TradingView embed or external links */}
          <SectionDivider label="Price chart" />
          <ChartPlaceholder ticker={data.ticker} exchange={data.exchange} />

          {/* Signals grid */}
          <SectionDivider label="Signals" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.625rem', marginBottom: '1.5rem' }}>
            {SIGNAL_DEFS.map(def => {
              const s = data.signals?.[def.key as keyof typeof data.signals];
              if (!s) return null;
              const sigColor = SIGNAL_COLORS[s.signal] ?? '#94a3b8';
              return (
                <div key={def.key} style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', borderRadius: 10, padding: '0.75rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>{def.label}</span>
                    <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: `${sigColor}20`, color: sigColor, border: `1px solid ${sigColor}40`, textTransform: 'capitalize' }}>{s.signal}</span>
                  </div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 2 }}>{s.value}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', lineHeight: 1.4 }}>{s.note}</div>
                </div>
              );
            })}
          </div>

          {/* Summary */}
          <SectionDivider label="Summary" />
          <div style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', borderRadius: 10, padding: '1rem', marginBottom: '1.5rem', fontSize: '0.875rem', color: 'var(--color-text-primary)', lineHeight: 1.7 }}>
            {data.summary}
          </div>

          {/* Key risks */}
          <SectionDivider label="Key risks" />
          <ul style={{ margin: '0 0 1.5rem 1rem', padding: 0, display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
            {data.keyRisks.map((risk, i) => (
              <li key={i} style={{ fontSize: '0.825rem', color: 'var(--color-text-muted)', lineHeight: 1.5 }}>{risk}</li>
            ))}
          </ul>

          {/* Add to watchlist */}
          <button
            onClick={handleAddToWatchlist}
            style={{ padding: '0.5rem 1.25rem', borderRadius: 8, border: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-text-muted)', fontSize: '0.825rem', cursor: 'pointer', marginBottom: '1rem' }}
          >
            + Add {data.ticker} to Watchlist
          </button>

          <Footnote isLive={isLive} />

          {data.dataNote && (
            <div style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)', marginTop: 4 }}>{data.dataNote}</div>
          )}
        </div>
      )}

      {/* ── Empty state ──────────────────────────────────────────────── */}
      {!data && !loading && !error && (
        <div style={{ textAlign: 'center', padding: '4rem 1rem', color: 'var(--color-text-muted)' }}>
          <div style={{ fontSize: '0.875rem', maxWidth: 380, margin: '0 auto', lineHeight: 1.6 }}>
            Enter a ticker (e.g. BHP.AX, AAPL) or company name to get a full analysis including cycle position, technical signals, and AI commentary.
          </div>
        </div>
      )}
    </div>
  );
}

// ── ChartPlaceholder ──────────────────────────────────────────────────────────

function ChartPlaceholder({ ticker, exchange }: { ticker: string; exchange: string }) {
  const yahooTicker = exchange?.toUpperCase().includes('ASX')
    ? ticker.replace(/\.AX$/, '') + '.AX'
    : exchange?.toUpperCase().includes('LSE') || exchange?.toUpperCase().includes('LONDON')
    ? ticker.replace(/\.L$/, '') + '.L'
    : ticker;

  const yahooUrl  = `https://finance.yahoo.com/chart/${encodeURIComponent(yahooTicker)}`;
  const googleUrl = `https://www.google.com/finance/quote/${encodeURIComponent(yahooTicker.replace('.AX', ':ASX').replace('.L', ':LON'))}`;

  return (
    <div style={{
      height: 120,
      background: 'var(--color-bg-surface)',
      border: '1px solid var(--color-border)',
      borderRadius: 10,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '0.75rem',
      marginBottom: '1.5rem',
    }}>
      <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>View chart externally:</div>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <a href={yahooUrl}  target="_blank" rel="noopener noreferrer" style={{ padding: '6px 16px', borderRadius: 8, border: '1px solid var(--color-border)', color: 'var(--color-accent)', fontSize: '0.8rem', textDecoration: 'none', background: 'var(--color-bg-surface2)' }}>Yahoo Finance ↗</a>
        <a href={googleUrl} target="_blank" rel="noopener noreferrer" style={{ padding: '6px 16px', borderRadius: 8, border: '1px solid var(--color-border)', color: 'var(--color-accent)', fontSize: '0.8rem', textDecoration: 'none', background: 'var(--color-bg-surface2)' }}>Google Finance ↗</a>
      </div>
    </div>
  );
}
