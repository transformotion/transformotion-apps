/**
 * Transformotion brand wordmark.
 *
 * T        — 26px, white
 * RANSFOR  — 21px, white
 * M        — 21px, teal  (#00C4B3)
 * O        — 21px, gold  (#E8A838)
 * TION     — 21px, teal  (#00C4B3)
 *
 * All letters: Bebas Neue, letter-spacing 0.06em.
 */

interface WordmarkProps {
  /** Scale multiplier applied to both font sizes. Default 1. */
  scale?: number;
}

export function Wordmark({ scale = 1 }: WordmarkProps) {
  const large  = `${Math.round(26 * scale)}px`;
  const normal = `${Math.round(21 * scale)}px`;

  const base: React.CSSProperties = {
    fontFamily:    "'Bebas Neue', sans-serif",
    letterSpacing: '0.06em',
    lineHeight:    1,
    userSelect:    'none',
  };

  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', ...base }}>
      <span style={{ fontSize: large,  color: '#FFFFFF' }}>T</span>
      <span style={{ fontSize: normal, color: '#FFFFFF' }}>RANSFOR</span>
      <span style={{ fontSize: normal, color: '#00C4B3' }}>M</span>
      <span style={{ fontSize: normal, color: '#E8A838' }}>O</span>
      <span style={{ fontSize: normal, color: '#00C4B3' }}>TION</span>
    </span>
  );
}
