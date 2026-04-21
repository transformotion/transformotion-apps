import type { CyclePosition } from '@transformotion/cycle-engine';

interface CycleGaugeProps {
  cp: CyclePosition;
  compact?: boolean;
}

// ── Zone definitions ──────────────────────────────────────────────────────────

const ZONES = [
  { label: 'Early move', from: 0,  to: 35,  color: '#22c87a' },
  { label: 'Mid trend',  from: 35, to: 60,  color: '#f0a030' },
  { label: 'Late stage', from: 60, to: 80,  color: '#f07030' },
  { label: 'Peak',       from: 80, to: 100, color: '#f05656' },
] as const;

function zoneForScore(score: number) {
  return ZONES.find(z => score >= z.from && score < z.to) ?? ZONES[ZONES.length - 1];
}

function zoneColor(score: number): string {
  return zoneForScore(score).color;
}

const STAGE_LABELS: Record<string, string> = {
  early: 'Early move',
  mid:   'Mid trend',
  late:  'Late stage',
  peak:  'Peak',
};

function signalIcon(type: string) {
  return { warn: '⚠', danger: '▼', ok: '✓' }[type] ?? '•';
}

// ── Full horizontal progress bar gauge (Analyser tab) ────────────────────────

export function CycleGauge({ cp }: CycleGaugeProps) {
  const score = Math.min(100, Math.max(0, cp.score ?? 0));
  const color = zoneColor(score);
  const label = STAGE_LABELS[cp.stage] ?? cp.stage;

  return (
    <div>
      {/* Zone labels */}
      <div style={{ display: 'flex', marginBottom: '0.375rem' }}>
        {ZONES.map(z => {
          const isActive = score >= z.from && (z.label === 'Peak' ? score >= 80 : score < z.to);
          return (
            <div
              key={z.label}
              style={{
                width:      `${z.to - z.from}%`,
                fontSize:   '0.68rem',
                textAlign:  'center',
                color:      isActive ? z.color : 'var(--color-text-muted)',
                fontWeight: isActive ? 600 : 400,
                transition: 'color 0.2s',
              }}
            >
              {z.label}
            </div>
          );
        })}
      </div>

      {/* Bar */}
      <div style={{ position: 'relative', height: 18, borderRadius: 9, overflow: 'hidden' }}>
        {ZONES.map(z => {
          const fillPct = score >= z.to
            ? 100
            : score > z.from
              ? ((score - z.from) / (z.to - z.from)) * 100
              : 0;
          return (
            <div
              key={z.label}
              style={{
                position: 'absolute',
                left:     `${z.from}%`,
                width:    `${z.to - z.from}%`,
                height:   '100%',
              }}
            >
              {/* Dim background (zones beyond score) */}
              <div style={{ position: 'absolute', inset: 0, background: z.color, opacity: 0.18 }} />
              {/* Filled portion up to score */}
              {fillPct > 0 && (
                <div style={{ position: 'absolute', left: 0, width: `${fillPct}%`, height: '100%', background: z.color }} />
              )}
            </div>
          );
        })}
        {/* Score marker */}
        <div style={{
          position:  'absolute',
          left:      `${score}%`,
          top:       0,
          height:    '100%',
          transform: 'translateX(-50%)',
          width:     3,
          background: 'rgba(255,255,255,0.9)',
          borderRadius: 1.5,
          zIndex:    2,
        }} />
      </div>

      {/* Score + stage */}
      <div style={{ textAlign: 'center', marginTop: '0.875rem' }}>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'baseline', gap: '0.25rem' }}>
          <span style={{ fontSize: '2rem', fontWeight: 700, color, letterSpacing: '-0.02em', lineHeight: 1 }}>
            {score}
          </span>
          <span style={{ fontSize: '1rem', color: 'var(--color-text-muted)', fontWeight: 400 }}>/ 100</span>
        </div>
        <div style={{ fontSize: '0.9rem', fontWeight: 600, color, marginTop: '0.25rem' }}>{label}</div>
        {cp.summary && (
          <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginTop: '0.375rem', lineHeight: 1.5, maxWidth: 480, margin: '0.375rem auto 0' }}>
            {cp.summary}
          </div>
        )}
      </div>

      {/* Signals */}
      {Array.isArray(cp.signals) && cp.signals.length > 0 && (
        <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          {cp.signals.map((sig, i) => (
            <div key={i} style={{
              display:    'flex',
              gap:        '0.375rem',
              fontSize:   '0.75rem',
              color:      sig.type === 'danger' ? '#ef4444' : sig.type === 'warn' ? '#f0a030' : '#4dc74d',
              background: sig.type === 'danger' ? 'rgba(239,68,68,0.08)' : sig.type === 'warn' ? 'rgba(240,160,48,0.08)' : 'rgba(77,199,77,0.08)',
              borderRadius: 4,
              padding:    '0.25rem 0.5rem',
              textAlign:  'left',
            }}>
              <span style={{ flexShrink: 0 }}>{signalIcon(sig.type)}</span>
              <span>{sig.text}</span>
            </div>
          ))}
        </div>
      )}

      {/* AI accuracy note */}
      <div style={{
        marginTop:    '0.875rem',
        fontSize:     '0.68rem',
        color:        'var(--color-text-muted)',
        textAlign:    'center',
        lineHeight:   1.5,
        padding:      '0.5rem 0.75rem',
        background:   'rgba(255,255,255,0.03)',
        borderRadius: 6,
        border:       '1px solid rgba(255,255,255,0.06)',
      }}>
        Cycle position is AI-estimated from price action, momentum and volume signals. Switch to Live mode for real-time accuracy.
      </div>
    </div>
  );
}

// ── Mini horizontal bar for Portfolio / Watchlist cards ──────────────────────

export function MiniCycleBar({ score, stage }: { score: number; stage?: string }) {
  const color = zoneColor(score);

  return (
    <div style={{ marginTop: 6 }}>
      {/* Bar — 6 px, full card width */}
      <div style={{ position: 'relative', height: 6, borderRadius: 3, overflow: 'hidden' }}>
        {ZONES.map(z => {
          const fillPct = score >= z.to
            ? 100
            : score > z.from
              ? ((score - z.from) / (z.to - z.from)) * 100
              : 0;
          return (
            <div
              key={z.label}
              style={{ position: 'absolute', left: `${z.from}%`, width: `${z.to - z.from}%`, height: '100%' }}
            >
              <div style={{ position: 'absolute', inset: 0, background: z.color, opacity: 0.18 }} />
              {fillPct > 0 && (
                <div style={{ position: 'absolute', left: 0, width: `${fillPct}%`, height: '100%', background: z.color }} />
              )}
            </div>
          );
        })}
        {/* Score marker */}
        <div style={{
          position:   'absolute',
          left:       `${score}%`,
          top:        0,
          height:     '100%',
          transform:  'translateX(-50%)',
          width:      2,
          background: 'rgba(255,255,255,0.85)',
          zIndex:     2,
        }} />
      </div>
      {/* Score + stage */}
      <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center', marginTop: 3 }}>
        <span style={{ fontSize: '0.65rem', fontWeight: 700, color }}>{score}</span>
        {stage && (
          <span style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', textTransform: 'capitalize' }}>{stage}</span>
        )}
      </div>
    </div>
  );
}

/** Compact inline badge (kept for potential future use). */
export function MiniCycleBadge({ score, stage }: { score: number; stage: string }) {
  const color = zoneColor(score);
  const label = STAGE_LABELS[stage] ?? stage;
  return (
    <span style={{
      display:     'inline-flex',
      alignItems:  'center',
      gap:         '0.25rem',
      padding:     '2px 8px',
      borderRadius:'999px',
      border:      `1px solid ${color}40`,
      background:  `${color}15`,
      color,
      fontSize:    '0.7rem',
      fontWeight:  600,
      whiteSpace:  'nowrap',
    }}>
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{score}</span>
      <span style={{ opacity: 0.7 }}>{label}</span>
    </span>
  );
}
