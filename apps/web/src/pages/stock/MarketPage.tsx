import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useClaude } from '../../hooks/useClaude';
import { useApiCache } from '../../hooks/useApiCache';
import { useMode } from '../../contexts/ModeContext';
import { ModeToggle } from '../../components/stock/ModeToggle';

// ── Types ─────────────────────────────────────────────────────────────────────

type GeoMarket = 'Global' | 'ASX' | 'US' | 'UK';

interface MacroData {
  cycleStage:     string; cyclePill:    string; cycleNote:    string;
  rateDirection:  string; ratePill:     string; rateNote:     string;
  keyRisk:        string; riskPill:     string; riskNote:     string;
  usdStrength:    string; usdPill:      string; usdNote:      string;
}

interface Sector {
  name:       string;
  signal:     'BUY' | 'HOLD' | 'EXIT';
  momentum:   number;
  valuation:  string;
  ytd:        string;
  thesis:     string;
  bestMarket: string;
}

interface ActionItem { sector: string; reason: string; }

interface MarketData {
  geo:       string;
  asOf:      string;
  macro:     MacroData;
  narrative: string;
  sectors:   Sector[];
  enter:     ActionItem[];
  exit:      ActionItem[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const GEO_OPTIONS: GeoMarket[] = ['Global', 'ASX', 'US', 'UK'];

const GEO_CTX: Record<GeoMarket, string> = {
  Global: 'global markets with a focus on major economies (US, Europe, Asia-Pacific, Australia)',
  ASX:    'the Australian sharemarket (ASX), with Australian economic context (RBA rates, AUD, commodities)',
  US:     'US equity markets (S&P 500, NASDAQ, NYSE), with US macro context (Fed, USD, inflation)',
  UK:     'UK equity markets (FTSE 100, FTSE 250), with UK macro context (BoE, GBP, inflation)',
};

const SECTOR_LISTS: Record<GeoMarket, string[]> = {
  Global: ['Technology','Financials','Healthcare','Energy','Materials','Industrials','Consumer Discretionary','Consumer Staples','Real Estate','Utilities','Communication Services','Telecommunications','Transportation & Logistics','Aerospace & Defence'],
  ASX:    ['Financials','Materials','Energy','Healthcare','Technology','Industrials','Consumer Discretionary','Consumer Staples','Real Estate & REITs','Critical Minerals','Utilities','Telecommunications','Transportation & Logistics','Aerospace & Defence'],
  US:     ['Technology','Financials','Healthcare','Energy','Materials','Industrials','Consumer Discretionary','Consumer Staples','Real Estate','Utilities','Communication Services','Telecommunications','Transportation & Logistics','Aerospace & Defence'],
  UK:     ['Financials','Energy','Healthcare','Materials','Industrials','Consumer Discretionary','Consumer Staples','Real Estate','Utilities','Technology','Communication Services','Telecommunications','Transportation & Logistics','Aerospace & Defence'],
};

const PILL_LABELS: Record<string, string> = { bull: 'Supportive', bear: 'Headwind', neutral: 'Neutral' };
const PILL_COLORS: Record<string, string> = { bull: '#4dc74d', bear: '#ef4444', neutral: '#94a3b8' };

// ── Component ─────────────────────────────────────────────────────────────────

export function MarketPage() {
  const [geo,      setGeo]      = useState<GeoMarket>('Global');
  const [data,     setData]     = useState<MarketData | null>(null);
  const [cachedAt, setCachedAt] = useState<string | null>(null);

  const { callClaude, loading, error } = useClaude();
  const { getCache, putCache }         = useApiCache();
  const { isLive }                     = useMode();
  const navigate                       = useNavigate();

  const fetchMarkets = useCallback(async (selectedGeo: GeoMarket, forceRefresh = false) => {
    if (!forceRefresh) {
      const cached = await getCache<MarketData>(`MKT_${selectedGeo}`);
      if (cached) {
        setData(cached.data);
        setCachedAt(cached.cachedAt);
        return;
      }
    }

    const sectors = SECTOR_LISTS[selectedGeo];
    const prompt = `You are a senior macro strategist. Analyse ${GEO_CTX[selectedGeo]} and return ONLY valid JSON (no markdown, no backticks, no emoji anywhere in the response).

You MUST include exactly these sectors in the "sectors" array, in this order: ${sectors.join(', ')}. Do not rename, combine, or omit any of them.

{
  "geo": "${selectedGeo}",
  "asOf": "e.g. April 2026",
  "macro": {
    "cycleStage": "e.g. Late Expansion",
    "cyclePill": "bull or neutral or bear",
    "cycleNote": "One sentence on the economic cycle",
    "rateDirection": "e.g. Easing",
    "ratePill": "bull or neutral or bear",
    "rateNote": "One sentence on central bank direction",
    "keyRisk": "e.g. Sticky inflation",
    "riskPill": "bear or neutral or bull",
    "riskNote": "One sentence on the biggest macro risk",
    "usdStrength": "e.g. Moderately Strong",
    "usdPill": "bull or neutral or bear",
    "usdNote": "One sentence on currency conditions"
  },
  "narrative": "3-4 sentence macro briefing covering cycle stage, key drivers, and sector rotation playbook.",
  "sectors": [
    { "name": "Technology", "signal": "BUY or HOLD or EXIT", "momentum": 82, "valuation": "Fair", "ytd": "+12.4%", "thesis": "One sentence rationale.", "bestMarket": "e.g. NASDAQ or ASX or FTSE 100 or Dow Jones — the single best market to get exposure to this sector right now, and one short reason why." }
  ],
  "enter": [
    { "sector": "Name", "reason": "Specific catalyst or condition for entering now." },
    { "sector": "Name", "reason": "Specific catalyst." },
    { "sector": "Name", "reason": "Specific catalyst." }
  ],
  "exit": [
    { "sector": "Name", "reason": "Specific risk or deterioration driving the exit." },
    { "sector": "Name", "reason": "Specific risk." },
    { "sector": "Name", "reason": "Specific risk." }
  ]
}
Momentum is 0-100. No emoji. Return ONLY the JSON object.`;

    const result = await callClaude<MarketData>({ prompt, webSearch: isLive });
    setData(result);
    setCachedAt(new Date().toISOString());
    await putCache(`MKT_${selectedGeo}`, result, isLive ? 'live' : 'fast', 'markets');
  }, [callClaude, getCache, putCache, isLive]);

  function handleGeoChange(newGeo: GeoMarket) {
    setGeo(newGeo);
    setData(null);
    setCachedAt(null);
  }

  function handleSectorClick(sector: Sector) {
    navigate('/stock/recs', { state: { sectorFilter: sector.name, bestMarket: sector.bestMarket } });
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

        {cachedAt && !loading && (
          <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>
            Cached {new Date(cachedAt).toLocaleTimeString()}
          </span>
        )}
      </div>

      {error && <ErrorBox message={error} />}

      {loading && <LoadingSpinner message={`Analysing macro conditions and sector signals for ${geo}…`} />}

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

export function ErrorBox({ message }: { message: string }) {
  return (
    <div style={{ padding: '0.75rem 1rem', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, color: '#fca5a5', fontSize: '0.875rem', marginBottom: '1rem' }}>
      {message}
    </div>
  );
}

export function LoadingSpinner({ message }: { message: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
      <div style={{ marginBottom: '0.5rem', fontSize: '1.25rem', opacity: 0.6 }}>⟳</div>
      {message}
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
