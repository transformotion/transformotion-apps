import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useClaude } from '../../hooks/useClaude';
import { useApiCache } from '../../hooks/useApiCache';
import { useMode } from '../../contexts/ModeContext';
import { ModeToggle } from '../../components/stock/ModeToggle';
import { CK, isCacheFresh, getCacheFreshness, formatCacheAge, type FreshnessLabel } from '../../lib/cacheConfig';
import { useTabStore } from '../../store/tabStore';
import type { GeoMarket, MacroData, Sector, ActionItem, MarketData } from '../../types/stock';

// ── Constants ─────────────────────────────────────────────────────────────────

const GEO_OPTIONS: GeoMarket[] = ['Global', 'ASX', 'US', 'UK'];

const GEO_CTX: Record<GeoMarket, string> = {
  Global: 'global markets with a focus on major economies (US, Europe, Asia-Pacific, Australia)',
  ASX:    'the Australian sharemarket (ASX), with Australian economic context (RBA rates, AUD, commodities)',
  US:     'US equity markets (S&P 500, NASDAQ, NYSE), with US macro context (Fed, USD, inflation)',
  UK:     'UK equity markets (FTSE 100, FTSE 250), with UK macro context (BoE, GBP, inflation)',
};

const SECTOR_LISTS: Record<GeoMarket, string[]> = {
  Global: ['Technology','Financials','Healthcare','Energy','Materials','Industrials','Consumer Discretionary','Real Estate'],
  ASX:    ['Financials','Materials','Energy','Healthcare','Technology','Industrials','Consumer Discretionary','Real Estate & REITs'],
  US:     ['Technology','Financials','Healthcare','Energy','Materials','Industrials','Consumer Discretionary','Real Estate'],
  UK:     ['Financials','Energy','Healthcare','Materials','Industrials','Consumer Discretionary','Technology','Real Estate'],
};

const PILL_LABELS: Record<string, string> = { bull: 'Supportive', bear: 'Headwind', neutral: 'Neutral' };
const PILL_COLORS: Record<string, string> = { bull: '#4dc74d', bear: '#ef4444', neutral: '#94a3b8' };

// ── Component ─────────────────────────────────────────────────────────────────

export function MarketPage() {
  const { geo, data, cachedAt } = useTabStore(s => s.market);
  const setMarket = useTabStore(s => s.setMarket);

  const { callClaude, loading, error, statusMessage } = useClaude();
  const { getCache, putCache }         = useApiCache();
  const { isLive }                     = useMode();
  const navigate                       = useNavigate();

  // Hydrate from DDB on mount so the tab shows data after a page reload,
  // even if the cached entry is stale. CacheStatusBadge shows staleness.
  useEffect(() => {
    if (data) return;
    void getCache<MarketData>(CK.market(geo)).then(cached => {
      if (cached) setMarket({ data: cached.data, cachedAt: cached.cachedAt });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchMarkets = useCallback(async (selectedGeo: GeoMarket, forceRefresh = false) => {
    if (!forceRefresh) {
      const cached = await getCache<MarketData>(CK.market(selectedGeo));
      if (cached && isCacheFresh(cached.cachedAt, 'markets')) {
        setMarket({ data: cached.data, cachedAt: cached.cachedAt });
        return;
      }
    }

    const sectors = SECTOR_LISTS[selectedGeo];
    const system = `You are a senior macro strategist. Return ONLY valid JSON — no markdown, no backticks, no emoji.`;
    const prompt = `Analyse ${GEO_CTX[selectedGeo]}.

Sectors (use exactly, in order): ${sectors.join(', ')}

Return this JSON structure:
{"geo":"${selectedGeo}","asOf":"Month YYYY","macro":{"cycleStage":"","cyclePill":"bull|neutral|bear","cycleNote":"","rateDirection":"","ratePill":"bull|neutral|bear","rateNote":"","keyRisk":"","riskPill":"bear|neutral|bull","riskNote":"","usdStrength":"","usdPill":"bull|neutral|bear","usdNote":""},"narrative":"3-4 sentence macro briefing.","sectors":[{"name":"","signal":"BUY|HOLD|EXIT","momentum":0,"valuation":"","ytd":"","thesis":"","bestMarket":""}],"enter":[{"sector":"","reason":""}],"exit":[{"sector":"","reason":""}]}

Rules: momentum 0-100; enter/exit have 3 items each; bestMarket is the single best exchange for that sector.`;

    const result = await callClaude<MarketData>({ prompt, system, webSearch: isLive });
    const now = new Date().toISOString();
    setMarket({ data: result, cachedAt: now });
    await putCache(CK.market(selectedGeo), result, isLive ? 'live' : 'fast', 'markets');
  }, [callClaude, getCache, putCache, isLive, setMarket]);

  function handleGeoChange(newGeo: GeoMarket) {
    setMarket({ geo: newGeo, data: null, cachedAt: null });
  }

  function handleSectorClick(sector: Sector) {
    // Pass sourceGeo so RecsPage uses the market being analysed (not bestMarket,
    // which is Claude's global recommendation and can differ from the current market).
    navigate('/stock/recs', { state: { sectorFilter: sector.name, bestMarket: sector.bestMarket, sourceGeo: geo } });
  }

  function signalStyle(signal: string): React.CSSProperties {
    const colors: Record<string, string> = { BUY: '#4dc74d', HOLD: '#f0a030', EXIT: '#ef4444' };
    const c = colors[signal] ?? '#94a3b8';
    return { color: c, border: `1px solid ${c}40`, background: `${c}15`, borderRadius: 4, padding: '2px 8px', fontSize: '0.7rem', fontWeight: 700 };
  }

  return (
    <div style={{ maxWidth: 960, margin: '0 auto' }}>

      {/* ── Toolbar ─────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1rem' }}>

        <div style={{ display: 'flex', gap: 4 }}>
          {GEO_OPTIONS.map(g => (
            <button
              key={g}
              onClick={() => handleGeoChange(g)}
              style={{
                padding:    '0.375rem 0.875rem',
                borderRadius: 6,
                border:     `1px solid ${geo === g ? 'var(--color-accent)' : 'var(--color-border)'}`,
                background: geo === g ? 'rgba(77,159,255,0.15)' : 'transparent',
                color:      geo === g ? 'var(--color-accent)' : 'var(--color-text-muted)',
                fontSize:   '0.8rem',
                fontWeight: geo === g ? 600 : 400,
                cursor:     'pointer',
              }}
            >{g}</button>
          ))}
        </div>

        <ModeToggle />

        <button
          onClick={() => fetchMarkets(geo, !!data)}
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
          {loading ? 'Analysing…' : data ? '↻ Refresh' : 'Analyse'}
        </button>

        {cachedAt && !loading && <CacheStatusBadge cachedAt={cachedAt} type="markets" />}
      </div>

      {error && <ErrorBox message={error} />}

      {loading && <LoadingSpinner message={`Analysing macro conditions and sector signals for ${geo}…`} subMessage={statusMessage} />}

      {data && !loading && (
        <div>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '1rem' }}>
            {data.geo} · {data.asOf}
          </div>

          {/* Macro cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
            {[
              { label: 'Cycle stage',    value: data.macro.cycleStage,    note: data.macro.cycleNote,    pill: data.macro.cyclePill    },
              { label: 'Rate direction', value: data.macro.rateDirection, note: data.macro.rateNote,     pill: data.macro.ratePill     },
              { label: 'Key risk',       value: data.macro.keyRisk,       note: data.macro.riskNote,     pill: data.macro.riskPill     },
              { label: 'USD / Currency', value: data.macro.usdStrength,   note: data.macro.usdNote,      pill: data.macro.usdPill      },
            ].map(card => (
              <MacroCard key={card.label} {...card} />
            ))}
          </div>

          <SectionDivider label="Macro briefing" />
          <div style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', borderRadius: 10, padding: '1rem', marginBottom: '1.5rem', fontSize: '0.875rem', color: 'var(--color-text-primary)', lineHeight: 1.7 }}>
            {data.narrative}
          </div>

          <SectionDivider label="Sector signals" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.625rem', marginBottom: '1.5rem' }}>
            {data.sectors.map(s => (
              <SectorCard key={s.name} sector={s} onClick={() => handleSectorClick(s)} signalStyle={signalStyle} />
            ))}
          </div>

          <SectionDivider label="Action summary" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1.5rem' }}>
            <ActionBox title="Enter / Overweight" items={data.enter} color="#4dc74d" />
            <ActionBox title="Exit / Reduce"      items={data.exit}  color="#ef4444" />
          </div>

          <Footnote isLive={isLive} />
        </div>
      )}

      {!data && !loading && !error && (
        <EmptyState
          message={`Select a market and press Analyse to get macro context and sector rotation signals for ${geo}.`}
          onAction={() => fetchMarkets(geo)}
          actionLabel={`Analyse ${geo}`}
        />
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function MacroCard({ label, value, note, pill }: { label: string; value: string; note: string; pill: string }) {
  const c = PILL_COLORS[pill] ?? '#94a3b8';
  return (
    <div style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', borderRadius: 10, padding: '0.875rem' }}>
      <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 4 }}>{value}</div>
      <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', lineHeight: 1.4, marginBottom: 8 }}>{note}</div>
      <span style={{ fontSize: '0.7rem', fontWeight: 600, padding: '2px 8px', borderRadius: 999, background: `${c}20`, color: c, border: `1px solid ${c}40` }}>
        {PILL_LABELS[pill] ?? pill}
      </span>
    </div>
  );
}

function SectorCard({ sector: s, onClick, signalStyle }: {
  sector: Sector;
  onClick: () => void;
  signalStyle: (sig: string) => React.CSSProperties;
}) {
  const barColor = s.signal === 'BUY' ? '#4dc74d' : s.signal === 'EXIT' ? '#ef4444' : '#f0a030';
  const borderColor = s.signal === 'BUY' ? 'rgba(77,199,77,0.25)' : s.signal === 'EXIT' ? 'rgba(239,68,68,0.25)' : 'var(--color-border)';
  return (
    <button onClick={onClick} style={{ background: 'var(--color-bg-surface)', border: `1px solid ${borderColor}`, borderRadius: 10, padding: '0.75rem', textAlign: 'left', cursor: 'pointer', width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>{s.name}</div>
        <span style={signalStyle(s.signal)}>{s.signal}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, marginBottom: 8, height: 20 }}>
        {[0,1,2,3,4].map(i => (
          <div key={i} style={{ width: 6, height: 6 + i * 4, borderRadius: 2, background: Math.round((s.momentum ?? 50) / 100 * 5) > i ? barColor : 'rgba(255,255,255,0.08)' }} />
        ))}
        <span style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', marginLeft: 4 }}>{s.momentum}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--color-text-muted)', marginBottom: 6 }}>
        <span>{s.valuation}</span>
        <span style={{ color: s.ytd?.startsWith('-') ? '#ef4444' : '#4dc74d' }}>{s.ytd}</span>
      </div>
      <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', lineHeight: 1.4, marginBottom: s.bestMarket ? 6 : 0 }}>{s.thesis}</div>
      {s.bestMarket && (
        <div style={{ fontSize: '0.68rem', color: 'var(--color-accent)', borderTop: '1px solid var(--color-border)', paddingTop: 6 }}>Best: {s.bestMarket}</div>
      )}
      <div style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)', marginTop: 4 }}>View picks →</div>
    </button>
  );
}

function ActionBox({ title, items, color }: { title: string; items: ActionItem[]; color: string }) {
  return (
    <div style={{ background: `${color}08`, border: `1px solid ${color}30`, borderRadius: 10, padding: '0.875rem' }}>
      <div style={{ fontSize: '0.75rem', fontWeight: 700, color, marginBottom: '0.625rem' }}>{title}</div>
      {items.map((item, i) => (
        <div key={i} style={{ display: 'flex', gap: '0.625rem', marginBottom: '0.625rem' }}>
          <div style={{ width: 20, height: 20, borderRadius: '50%', background: `${color}25`, color, fontSize: '0.65rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{i + 1}</div>
          <div>
            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>{item.sector}</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', lineHeight: 1.4 }}>{item.reason}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function SectionDivider({ label }: { label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
      <div style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
      <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>{label}</span>
      <div style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
    </div>
  );
}

export function Footnote({ isLive }: { isLive: boolean }) {
  return (
    <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', marginTop: '1rem', lineHeight: 1.6, borderTop: '1px solid var(--color-border)', paddingTop: '0.75rem' }}>
      AI-generated analysis ·{' '}
      <span style={{ color: isLive ? '#4dc74d' : 'var(--color-accent)', fontWeight: 600 }}>
        {isLive ? 'Live mode' : 'Fast mode'}
      </span>
      <br />Not financial advice. Always consult a licensed financial adviser.
    </div>
  );
}

const RATE_LIMIT_PATTERN = /rate limit/i;

export function ErrorBox({ message }: { message: string }) {
  const { isLive }  = useMode();
  const isRateLimit = RATE_LIMIT_PATTERN.test(message);
  const [countdown, setCountdown] = useState(isRateLimit ? 60 : 0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!isRateLimit) return;
    setCountdown(60);
    intervalRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) { clearInterval(intervalRef.current!); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isRateLimit, message]);

  if (isRateLimit) {
    return (
      <div style={{ padding: '0.875rem 1rem', background: 'rgba(240,160,48,0.1)', border: '1px solid rgba(240,160,48,0.35)', borderRadius: 8, color: '#fcd48a', fontSize: '0.875rem', marginBottom: '1rem' }}>
        <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>Rate limit reached</div>
        <div style={{ color: 'rgba(252,212,138,0.8)', lineHeight: 1.5 }}>
          The Anthropic API quota was temporarily exceeded.{' '}
          {countdown > 0
            ? <>Retry in <strong style={{ color: '#fcd48a' }}>{countdown}s</strong>{isLive ? <>, or switch to <strong>Fast mode</strong> to skip web search</> : null}.</>
            : <>You can try again now{isLive ? <>, or switch to <strong>Fast mode</strong> to skip web search</> : null}.</>}
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '0.75rem 1rem', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, color: '#fca5a5', fontSize: '0.875rem', marginBottom: '1rem' }}>
      {message}
    </div>
  );
}

// ── CacheStatusBadge ──────────────────────────────────────────────────────────

const FRESHNESS_STYLE: Record<FreshnessLabel, { color: string; label: string }> = {
  fresh:    { color: '#4dc74d', label: 'Fresh'    },
  recent:   { color: '#f0a030', label: 'Recent'   },
  stale:    { color: '#ef8c44', label: 'Stale'    },
  outdated: { color: '#ef4444', label: 'Outdated' },
};

export function CacheStatusBadge({ cachedAt, type }: { cachedAt: string; type: string }) {
  const freshness = getCacheFreshness(cachedAt, type);
  if (!freshness) return null;
  const { color, label } = FRESHNESS_STYLE[freshness];
  return (
    <span style={{ fontSize: '0.68rem', color, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: color, display: 'inline-block', flexShrink: 0 }} />
      {label} · {formatCacheAge(cachedAt)}
    </span>
  );
}

export function LoadingSpinner({ message, subMessage }: { message: string; subMessage?: string | null }) {
  return (
    <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
      <div className="spin" style={{ marginBottom: '0.5rem', fontSize: '1.25rem', opacity: 0.6 }}>⟳</div>
      <div>{message}</div>
      {subMessage && (
        <div style={{ marginTop: '0.5rem', fontSize: '0.78rem', color: '#f0a030', opacity: 0.9 }}>{subMessage}</div>
      )}
    </div>
  );
}

export function EmptyState({ message, onAction, actionLabel }: { message: string; onAction?: () => void; actionLabel?: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '4rem 1rem', color: 'var(--color-text-muted)' }}>
      <div style={{ fontSize: '0.875rem', maxWidth: 380, margin: '0 auto 1.5rem', lineHeight: 1.6 }}>{message}</div>
      {onAction && actionLabel && (
        <button onClick={onAction} style={{ padding: '0.5rem 1.25rem', borderRadius: 8, border: '1px solid var(--color-accent)', background: 'rgba(77,159,255,0.15)', color: 'var(--color-accent)', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer' }}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}
