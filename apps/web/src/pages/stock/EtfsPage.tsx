import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useClaude } from '../../hooks/useClaude';
import { useApiCache } from '../../hooks/useApiCache';
import { useMode } from '../../contexts/ModeContext';
import { ModeToggle } from '../../components/stock/ModeToggle';
import { ErrorBox, LoadingSpinner, EmptyState, Footnote } from './MarketPage';

// ── Types ─────────────────────────────────────────────────────────────────────

type EtfMarket = 'ASX' | 'US' | 'Global';

interface EtfPick {
  ticker:      string;
  companyName: string;
  sector:      string;
  verdict:     string;
  currentPrice:string;
  priceChange: string;
  reason:      string;
}

interface EtfsData {
  market: string;
  asOf:   string;
  stocks: EtfPick[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MARKET_OPTIONS: EtfMarket[] = ['ASX', 'US', 'Global'];

const MARKET_CTX: Record<EtfMarket, string> = {
  ASX:    'ASX-listed ETFs (e.g. VAS, VGS, NDQ, IVV, ETHI, VAE, VHY, IAF, VAP, SLF). Use AUD pricing and .AX suffixes. Include a mix of broad index, sector, bond, property/REIT, and thematic ETFs.',
  US:     'US-listed ETFs on NASDAQ or NYSE (e.g. SPY, QQQ, VTI, BND, GLD, VNQ, XLRE, ARKK). Use USD pricing. Include a mix of broad index, sector, bond, property/REIT, and thematic ETFs.',
  Global: 'Globally diversified or mixed ETFs covering multiple regions or asset classes, including global property/REIT options like DJRE.',
};

const VERDICT_COLORS: Record<string, string> = { BUY: '#4dc74d', HOLD: '#f0a030', SELL: '#ef4444', NEUTRAL: '#94a3b8' };

// ── Component ─────────────────────────────────────────────────────────────────

export function EtfsPage() {
  const [market,   setMarket]   = useState<EtfMarket>('ASX');
  const [data,     setData]     = useState<EtfsData | null>(null);
  const [cachedAt, setCachedAt] = useState<string | null>(null);

  const { callClaude, loading, error } = useClaude();
  const { getCache, putCache }         = useApiCache();
  const { isLive }                     = useMode();
  const navigate                       = useNavigate();

  const fetchEtfs = useCallback(async (selectedMarket: EtfMarket, forceRefresh = false) => {
    const cacheKey = `ETFS_${selectedMarket}`;

    if (!forceRefresh) {
      const cached = await getCache<EtfsData>(cacheKey);
      if (cached) {
        setData(cached.data);
        setCachedAt(cached.cachedAt);
        return;
      }
    }

    const ctx    = MARKET_CTX[selectedMarket];
    const prompt = `Financial analyst. Identify the top 6 ETFs to consider right now from ${ctx}
Assess fees, underlying index quality, recent performance, distribution yield, and current momentum. Ensure the 6 picks cover a range of categories including at least one property/REIT ETF and one bond/defensive ETF alongside growth options.
Return ONLY valid JSON (no markdown):
{
  "market": "${selectedMarket}", "asOf": "e.g. April 2026",
  "stocks": [{ "ticker":"","companyName":"Full ETF name","sector":"Category e.g. Broad Index / Technology / Property & REITs / Bonds / Commodities","verdict":"BUY or HOLD","currentPrice":"","priceChange":"e.g. +1.2%","reason":"2 sentences — why this ETF stands out right now, include expense ratio and key feature." }]
}`;

    const result = await callClaude<EtfsData>({ prompt, webSearch: true });
    setData(result);
    setCachedAt(new Date().toISOString());
    await putCache(cacheKey, result, isLive ? 'live' : 'fast', 'etfs');
  }, [callClaude, getCache, putCache, isLive]);

  function handleMarketChange(m: EtfMarket) {
    setMarket(m);
    setData(null);
    setCachedAt(null);
  }

  return (
    <div style={{ maxWidth: 960, margin: '0 auto' }}>

      {/* ── Toolbar ─────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {MARKET_OPTIONS.map(m => (
            <button
              key={m}
              onClick={() => handleMarketChange(m)}
              style={{
                padding:    '0.375rem 0.875rem',
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

        <ModeToggle />

        <button
          onClick={() => fetchEtfs(market, !!data)}
          disabled={loading}
          style={{ padding: '0.375rem 1rem', borderRadius: 6, border: '1px solid var(--color-accent)', background: 'rgba(77,159,255,0.15)', color: 'var(--color-accent)', fontSize: '0.8rem', fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1 }}
        >
          {loading ? 'Finding…' : data ? '↻ Refresh' : 'Get ETF Picks'}
        </button>

        {cachedAt && !loading && (
          <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>
            Cached {new Date(cachedAt).toLocaleTimeString()}
          </span>
        )}
      </div>

      {error && <ErrorBox message={error} />}
      {loading && <LoadingSpinner message="Finding top ETF picks…" />}

      {data && !loading && (
        <div>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '1rem' }}>
            {data.market} ETFs · {data.asOf}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
            {data.stocks.map(etf => (
              <EtfCard
                key={etf.ticker}
                etf={etf}
                onClick={() => navigate('/stock/analyse', { state: { ticker: etf.ticker } })}
              />
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
          message={`Select a market and press Get ETF Picks to see top ETF recommendations for ${market}.`}
          onAction={() => fetchEtfs(market)}
          actionLabel="Get ETF Picks"
        />
      )}
    </div>
  );
}

// ── EtfCard ───────────────────────────────────────────────────────────────────

function EtfCard({ etf: e, onClick }: { etf: EtfPick; onClick: () => void }) {
  const verdictColor = VERDICT_COLORS[e.verdict] ?? '#94a3b8';
  const isUp = !e.priceChange?.startsWith('-');
  return (
    <button
      onClick={onClick}
      style={{ background: 'var(--color-bg-surface)', border: `1px solid ${verdictColor}25`, borderRadius: 12, padding: '0.875rem', textAlign: 'left', cursor: 'pointer', width: '100%' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
        <div>
          <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--color-text-primary)', fontFamily: 'monospace' }}>{e.ticker}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{e.companyName}</div>
          <div style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)', marginTop: 2 }}>{e.sector}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <span style={{ color: verdictColor, border: `1px solid ${verdictColor}40`, background: `${verdictColor}15`, borderRadius: 4, padding: '2px 8px', fontSize: '0.7rem', fontWeight: 700 }}>
            {e.verdict}
          </span>
          {e.currentPrice && <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-text-primary)', marginTop: 4 }}>{e.currentPrice}</div>}
          {e.priceChange  && <div style={{ fontSize: '0.72rem', color: isUp ? '#4dc74d' : '#ef4444' }}>{e.priceChange}</div>}
        </div>
      </div>
      <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', lineHeight: 1.5, marginBottom: 8 }}>{e.reason}</div>
      <div style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)' }}>Tap to analyse →</div>
    </button>
  );
}
