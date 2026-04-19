import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useClaude } from '../../hooks/useClaude';
import { useApiCache } from '../../hooks/useApiCache';
import { useApiClient } from '../../hooks/useApiClient';
import { useMode } from '../../contexts/ModeContext';
import { ModeToggle } from '../../components/stock/ModeToggle';
import { CycleGauge } from '../../components/stock/CycleGauge';
import { SectionDivider, ErrorBox, LoadingSpinner, Footnote, CacheStatusBadge } from './MarketPage';
import { CK, isCacheFresh } from '../../lib/cacheConfig';
import { useTabStore } from '../../store/tabStore';
import type { SignalItem, AnalysisData } from '../../types/stock';

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

  const { inputValue, data, cachedAt } = useTabStore(s => s.analyser);
  const setAnalyser = useTabStore(s => s.setAnalyser);

  const inputRef = useRef<HTMLInputElement>(null);

  const { callClaude, loading, error, statusMessage } = useClaude();
  const { getCache, putCache }         = useApiCache();
  const api                            = useApiClient();
  const { isLive }                     = useMode();

  // Drill-through: navigated to with a specific ticker (from Recs / ETFs / Metals /
  // Portfolio / Watchlist). Run a fresh analysis — don't restore preserved state.
  // Dep on routeState?.ticker so it fires even if the component is already mounted.
  useEffect(() => {
    if (routeState?.ticker) {
      setAnalyser({ inputValue: routeState.ticker });
      navigate('/stock/analyse', { replace: true, state: null });
      void runAnalysis(routeState.ticker, false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeState?.ticker]);

  // Mount hydration: if Zustand has no data (fresh page load), load the last
  // analysed ticker from user preferences and show its DDB cache entry — even if stale.
  useEffect(() => {
    if (data || routeState?.ticker) return; // session already has data or drill-through pending
    void api.getUserProfile()
      .then(async profile => {
        const last = profile.preferences.lastAnalysedTicker;
        if (!last) return;
        const cached = await getCache<AnalysisData>(CK.analysis(last));
        if (cached?.data) {
          setAnalyser({ inputValue: last, data: cached.data, cachedAt: cached.cachedAt });
        }
      })
      .catch(() => {}); // silent — blank state is acceptable fallback
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Mount only

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
CYCLE POSITION SCORING RULES — READ CAREFULLY:
cyclePosition.score measures WHERE THE STOCK IS IN ITS PRICE CYCLE only. It is NOT a measure of business quality, fundamentals, or long-term prospects. A fundamentally excellent company trading near its 52-week lows MUST score LOW (early cycle = good time to buy).

Score bands and criteria:
- 0–35 (early): Stock is near multi-month or 52-week LOWS. Oversold RSI (<45). Price has corrected significantly from recent highs (≥15% below 52w high). Building a base / accumulation. Strong fundamentals are IRRELEVANT here — score LOW.
- 35–60 (mid): Recovered from lows, trending up with momentum. RSI neutral-to-bullish (45–65). Trading between lows and highs. Volume confirming the move.
- 60–80 (late): Approaching or near recent highs. RSI elevated (65+). Extended from moving averages. Risk/reward deteriorating.
- 80–100 (peak): At or near 52-week highs. RSI overbought (70+). Volume diverging. Distribution phase. High reversal risk.

Inputs to weight (in order of importance):
1. Distance from 52-week HIGH (most important) — 20%+ below peak pushes score toward 0–35
2. RSI — oversold <40 = low score, overbought >70 = high score
3. Distance from 52-week LOW — near low = low score
4. Price momentum — declining trend = lower score
5. Volume pattern — accumulation vs distribution

Inputs to IGNORE for cycle scoring: P/E ratio, revenue growth, analyst ratings, competitive position, management quality. These affect verdict/signals but NOT cyclePosition.score.

weekHigh52Pct is how close current price is to 52-week high (0–100, where 100 = at the high).`;
  }, [isLive]);

  const runAnalysis = useCallback(async (ticker: string, forceRefresh: boolean, extraNote?: string) => {
    const t = ticker.trim().toUpperCase();
    if (!t) return;

    if (!forceRefresh && !extraNote) {
      const cached = await getCache<AnalysisData>(CK.analysis(t));
      if (cached && isCacheFresh(cached.cachedAt, 'analyser')) {
        setAnalyser({ inputValue: t, data: cached.data, cachedAt: cached.cachedAt });
        return;
      }
    }

    const prompt = buildPrompt(t, extraNote);
    const result = await callClaude<AnalysisData>({ prompt, webSearch: isLive });
    const now = new Date().toISOString();
    setAnalyser({ inputValue: t, data: result, cachedAt: now });
    const mode = isLive ? 'live' : 'fast';
    await putCache(CK.analysis(t), result, mode, 'analyser');
    if (result.cyclePosition !== undefined) {
      void putCache(CK.cycle(t), result.cyclePosition, mode, 'cycle');
    }
    // Persist last-analysed ticker so the Analyser can restore it on next page load
    void api.putUserPreferences({ lastAnalysedTicker: t }).catch(() => {});
  }, [buildPrompt, callClaude, getCache, putCache, isLive, setAnalyser, api]);

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
        setAnalyser({ inputValue: listed[0].ticker });
        void runAnalysis(listed[0].ticker, false);
      } else if (listed.length > 1) {
        // Show picker — for now just use the first match
        setAnalyser({ inputValue: listed[0].ticker });
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
    // Use data.ticker if Claude returned it, otherwise fall back to the user's input.
    // data.ticker can be undefined if Claude omitted the field from the JSON response.
    const ticker = (data.ticker ?? inputValue).toUpperCase();
    void putCache(CK.analysis(ticker), data, isLive ? 'live' : 'fast', 'analyser');
    navigate('/stock/watchlist', { state: { addTicker: ticker, addName: data.companyName ?? inputValue } });
  }

  const verdictColor = data ? (VERDICT_COLORS[data.verdict] ?? '#94a3b8') : '#94a3b8';

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>

      {/* ── Search bar ──────────────────────────────────────────────── */}
      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          ref={inputRef}
          value={inputValue}
          onChange={e => setAnalyser({ inputValue: e.target.value })}
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
      {loading && <LoadingSpinner message={`Analysing ${inputValue.trim().toUpperCase() || '…'}`} subMessage={statusMessage} />}

      {/* ── Analysis result ──────────────────────────────────────────── */}
      {data && !loading && (
        <div>
          {cachedAt && (
            <div style={{ marginBottom: '0.75rem' }}>
              <CacheStatusBadge cachedAt={cachedAt} type="analyser" />
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
          <TradingViewChart ticker={data.ticker} exchange={data.exchange} />

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
            {(data.keyRisks ?? []).map((risk, i) => (
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

// ── TradingView symbol mapper ─────────────────────────────────────────────────

function toTradingViewSymbol(ticker: string | undefined, exchange: string | undefined): string {
  const t  = (ticker   || '').toUpperCase();
  const ex = (exchange || '').toUpperCase();
  if (!t) return '';
  if (t.endsWith('.AX')) return 'ASX:' + t.replace('.AX', '');
  if (t.endsWith('.L'))  return 'LSE:' + t.replace('.L', '');
  if (ex.includes('NASDAQ')) return 'NASDAQ:' + t;
  if (ex.includes('NYSE'))   return 'NYSE:' + t;
  if (ex.includes('ASX'))    return 'ASX:' + t;
  if (ex.includes('LSE') || ex.includes('LONDON')) return 'LSE:' + t;
  return t;
}

// Derive fallback links from the raw ticker (Yahoo accepts .AX suffix natively)
function fallbackLinks(ticker: string | undefined, tvSymbol: string) {
  const safe = (ticker || '').toUpperCase();
  const yahooUrl  = `https://finance.yahoo.com/quote/${encodeURIComponent(safe)}`;
  const googleSymbol = tvSymbol.includes(':')
    ? tvSymbol.split(':').reverse().join(':')
    : tvSymbol;
  const googleUrl = `https://www.google.com/finance/quote/${encodeURIComponent(googleSymbol)}`;
  return { yahooUrl, googleUrl };
}

// ── TradingViewChart ──────────────────────────────────────────────────────────

function TradingViewChart({ ticker, exchange }: { ticker: string; exchange: string }) {
  const symbol = toTradingViewSymbol(ticker, exchange);
  const src = [
    'https://www.tradingview.com/widgetembed/',
    `?symbol=${encodeURIComponent(symbol)}`,
    '&interval=D',
    '&style=6',
    '&theme=dark',
    '&locale=en',
    '&hide_top_toolbar=0',
    '&hide_legend=0',
    '&save_image=0',
  ].join('');

  const { yahooUrl, googleUrl } = fallbackLinks(ticker, symbol);

  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <div
        className="tv-chart"
        style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid var(--color-border)' }}
      >
        <iframe
          src={src}
          style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
          allow="fullscreen"
          title={`${ticker} price chart`}
        />
      </div>
      <div style={{ marginTop: '0.5rem', fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>
        Chart unavailable for this ticker? View on{' '}
        <a href={yahooUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-steel)', textDecoration: 'underline' }}>
          Yahoo Finance ↗
        </a>
        {' '}or{' '}
        <a href={googleUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-steel)', textDecoration: 'underline' }}>
          Google Finance ↗
        </a>
      </div>
    </div>
  );
}
