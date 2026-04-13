import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useClaude } from '../../hooks/useClaude';
import { useApiCache } from '../../hooks/useApiCache';
import { useMode } from '../../contexts/ModeContext';
import { ErrorBox, LoadingSpinner, EmptyState, Footnote } from './MarketPage';

// ── Types ─────────────────────────────────────────────────────────────────────

interface MetalData {
  name:             string;
  symbol:           string;
  asxEtf:           string;
  asxEtfName:       string;
  spotPrice:        string;
  priceChange:      string;
  ytdReturn:        string;
  ytdValue:         number;
  signal:           'bull' | 'neutral' | 'bear';
  fiftyTwoWeekHigh: string;
  fiftyTwoWeekLow:  string;
  outlook:          string;
  barColor:         string;
}

interface MetalsResponse {
  asOf:   string;
  metals: MetalData[];
}

// ── Prompt ────────────────────────────────────────────────────────────────────

const METALS_PROMPT = `Financial analyst with web search access. Get current data for gold, silver, platinum, and palladium spot prices.
Return ONLY valid JSON (no markdown):
{
  "asOf": "Date string",
  "metals": [
    {
      "name": "Gold",
      "symbol": "XAU/USD",
      "asxEtf": "PMGOLD.AX",
      "asxEtfName": "Perth Mint Gold",
      "spotPrice": "USD price e.g. US$3,200/oz",
      "priceChange": "e.g. +0.8% today",
      "ytdReturn": "e.g. +18.4% YTD",
      "ytdValue": 18.4,
      "signal": "bull or neutral or bear",
      "fiftyTwoWeekHigh": "e.g. US$3,245",
      "fiftyTwoWeekLow": "e.g. US$2,100",
      "outlook": "2 sentences on current drivers and near-term outlook.",
      "barColor": "#f0a030"
    }
  ]
}
Use these exact ASX ETF mappings: Gold -> PMGOLD.AX (Perth Mint Gold), Silver -> ETPMAG.AX (Perth Mint Silver), Platinum -> ETPMPT.AX (Perth Mint Platinum), Palladium -> ETPMPD.AX (Perth Mint Palladium).
Include gold, silver, platinum, palladium. Use current spot prices from web search. Return ONLY the JSON.`;

const SIGNAL_COLORS: Record<string, string> = { bull: '#4dc74d', neutral: '#f0a030', bear: '#ef4444' };

// ── Component ─────────────────────────────────────────────────────────────────

export function MetalsPage() {
  const [data,     setData]     = useState<MetalsResponse | null>(null);
  const [cachedAt, setCachedAt] = useState<string | null>(null);

  const { callClaude, loading, error } = useClaude();
  const { getCache, putCache }         = useApiCache();
  const { isLive }                     = useMode();
  const navigate                       = useNavigate();

  const fetchMetals = useCallback(async (forceRefresh = false) => {
    if (!forceRefresh) {
      const cached = await getCache<MetalsResponse>('METALS');
      if (cached) {
        setData(cached.data);
        setCachedAt(cached.cachedAt);
        return;
      }
    }
    const result = await callClaude<MetalsResponse>({ prompt: METALS_PROMPT, webSearch: true });
    setData(result);
    setCachedAt(new Date().toISOString());
    await putCache('METALS', result, 'live', 'metals');
  }, [callClaude, getCache, putCache]);

  const maxYtd = data ? Math.max(...data.metals.map(m => Math.abs(m.ytdValue ?? 0)), 1) : 1;

  return (
    <div style={{ maxWidth: 960, margin: '0 auto' }}>

      {/* ── Toolbar ─────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <button
          onClick={() => fetchMetals(!!data)}
          disabled={loading}
          style={{ padding: '0.375rem 1rem', borderRadius: 6, border: '1px solid var(--color-accent)', background: 'rgba(77,159,255,0.15)', color: 'var(--color-accent)', fontSize: '0.8rem', fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1 }}
        >
          {loading ? 'Fetching…' : data ? '↻ Refresh' : 'Get Prices'}
        </button>

        {cachedAt && !loading && (
          <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>
            Cached {new Date(cachedAt).toLocaleTimeString()}
          </span>
        )}
      </div>

      {error && <ErrorBox message={error} />}
      {loading && <LoadingSpinner message="Fetching precious metals spot prices…" />}

      {data && !loading && (
        <div>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '1rem' }}>
            Spot prices · {data.asOf}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
            {data.metals.map(m => (
              <MetalCard
                key={m.name}
                metal={m}
                maxYtd={maxYtd}
                onAnalyse={() => navigate('/stock/analyse', { state: { ticker: m.asxEtf } })}
              />
            ))}
          </div>

          <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', lineHeight: 1.6 }}>
            Spot prices from web search. ASX ETF links run a full analysis. Not financial advice.
          </div>
          <Footnote isLive={isLive} />
        </div>
      )}

      {!data && !loading && !error && (
        <EmptyState
          message="Press Get Prices to fetch current spot prices and outlook for gold, silver, platinum, and palladium."
          onAction={() => fetchMetals()}
          actionLabel="Get Prices"
        />
      )}
    </div>
  );
}

// ── MetalCard ─────────────────────────────────────────────────────────────────

function MetalCard({ metal: m, maxYtd, onAnalyse }: {
  metal: MetalData;
  maxYtd: number;
  onAnalyse: () => void;
}) {
  const signalColor = SIGNAL_COLORS[m.signal] ?? '#94a3b8';
  const fillPct     = Math.min(100, Math.abs(m.ytdValue ?? 0) / maxYtd * 100);
  const fillColor   = (m.ytdValue ?? 0) >= 0 ? '#4dc74d' : '#ef4444';
  const isUp        = !m.priceChange?.startsWith('-');

  return (
    <div style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', borderRadius: 12, padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>{m.name}</div>
          <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>{m.symbol}</div>
        </div>
        <span style={{ fontSize: '0.72rem', fontWeight: 600, padding: '2px 10px', borderRadius: 999, background: `${signalColor}15`, color: signalColor, border: `1px solid ${signalColor}40`, textTransform: 'capitalize' }}>
          {m.signal}
        </span>
      </div>

      {/* Price */}
      <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>{m.spotPrice}</div>
      <div style={{ fontSize: '0.78rem', color: isUp ? '#4dc74d' : '#ef4444', fontWeight: 600 }}>{m.ytdReturn}</div>

      {/* YTD bar */}
      <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${fillPct}%`, background: fillColor, borderRadius: 3, transition: 'width 0.4s' }} />
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 4 }}>
        {[
          { label: '52w High', value: m.fiftyTwoWeekHigh },
          { label: '52w Low',  value: m.fiftyTwoWeekLow  },
          { label: 'Today',    value: m.priceChange, color: isUp ? '#4dc74d' : '#ef4444' },
          { label: 'Signal',   value: m.signal,     color: signalColor },
        ].map(stat => (
          <div key={stat.label} style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>
            <div style={{ marginBottom: 2 }}>{stat.label}</div>
            <div style={{ color: stat.color ?? 'var(--color-text-primary)', fontWeight: 600 }}>{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Outlook */}
      <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', lineHeight: 1.5 }}>{m.outlook}</div>

      {/* ASX ETF button */}
      {m.asxEtf && (
        <button
          onClick={onAnalyse}
          style={{ width: '100%', padding: '0.5rem', borderRadius: 8, border: 'none', background: 'var(--color-accent)', color: '#fff', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', marginTop: 4 }}
        >
          Analyse {m.asxEtfName ?? m.asxEtf} ({m.asxEtf})
        </button>
      )}
    </div>
  );
}
