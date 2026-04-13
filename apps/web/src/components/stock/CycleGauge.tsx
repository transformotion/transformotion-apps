import type { CyclePosition } from '@transformotion/cycle-engine';

interface CycleGaugeProps {
  cp: CyclePosition;
  compact?: boolean;
}

const STAGE_LABELS: Record<string, string> = {
  early: 'Early move',
  mid:   'Mid trend',
  late:  'Late stage',
  peak:  'Potential peak',
};

function scoreColor(score: number): string {
  if (score < 40)  return '#4dc74d';   // green
  if (score < 65)  return '#f0a030';   // amber
  if (score < 82)  return '#f06438';   // orange
  return '#ef4444';                    // red
}

function signalIcon(type: string) {
  return { warn: '⚠', danger: '▼', ok: '✓' }[type] ?? '•';
}

/** Semicircular arc gauge — mirrors renderCycleGauge() in the HTML app. */
export function CycleGauge({ cp, compact = false }: CycleGaugeProps) {
  const score  = Math.min(100, Math.max(0, cp.score ?? 0));
  const color  = scoreColor(score);
  const label  = STAGE_LABELS[cp.stage] ?? cp.stage;

  // SVG arc: half circle from 180° to 0° (left to right)
  const r   = 60;
  const cx  = 80;
  const cy  = 70;
  const pct = score / 100;
  // Angle goes from π (left) to 0 (right), so needle angle = π - pct * π
  const angle  = Math.PI - pct * Math.PI;
  const needleX = cx + r * Math.cos(angle);
  const needleY = cy - r * Math.sin(angle);   // SVG y is inverted

  const arcBg   = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;
  const arcFill = pct > 0
    ? (() => {
        const endAngle = Math.PI - pct * Math.PI;
        const ex = cx + r * Math.cos(endAngle);
        const ey = cy - r * Math.sin(endAngle);
        const large = pct > 0.5 ? 1 : 0;
        return `M ${cx - r} ${cy} A ${r} ${r} 0 ${large} 1 ${ex} ${ey}`;
      })()
    : '';

  return (
    <div style={{ display: 'flex', flexDirection: compact ? 'row' : 'column', alignItems: 'center', gap: compact ? '1rem' : '0.5rem' }}>

      {/* SVG gauge */}
      <svg width={compact ? 120 : 160} height={compact ? 60 : 80} viewBox="0 0 160 80" style={{ overflow: 'visible' }}>
        {/* Background arc */}
        <path d={arcBg} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={compact ? 10 : 12} strokeLinecap="round" />
        {/* Filled arc */}
        {arcFill && (
          <path d={arcFill} fill="none" stroke={color} strokeWidth={compact ? 10 : 12} strokeLinecap="round" />
        )}
        {/* Needle */}
        <line x1={cx} y1={cy} x2={needleX} y2={needleY} stroke={color} strokeWidth="2.5" strokeLinecap="round" />
        <circle cx={cx} cy={cy} r={4} fill={color} />
        {/* Score label */}
        <text x={cx} y={compact ? cy + 22 : cy + 18} textAnchor="middle" fontSize={compact ? 18 : 22} fontWeight="700" fill={color}>{score}</text>
      </svg>

      {/* Stage + summary */}
      <div style={{ textAlign: compact ? 'left' : 'center', flex: 1 }}>
        <div style={{ fontSize: '0.875rem', fontWeight: 600, color }}>{label}</div>
        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: 4, lineHeight: 1.4 }}>{cp.summary}</div>

        {/* Signals */}
        {!compact && cp.signals?.length > 0 && (
          <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
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
      </div>
    </div>
  );
}

/** Compact inline cycle badge for use in cards (recs, watchlist, portfolio). */
export function MiniCycleBadge({ score, stage }: { score: number; stage: string }) {
  const color = scoreColor(score);
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
