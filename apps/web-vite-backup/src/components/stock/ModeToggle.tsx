import { useMode } from '../../contexts/ModeContext';

/**
 * Fast / Live mode toggle button — mirrors the HTML app's mode toggle.
 * Displayed inside tab pages that make Claude API calls.
 */
export function ModeToggle() {
  const { mode, toggleMode } = useMode();
  const isLive = mode === 'live';

  return (
    <button
      onClick={toggleMode}
      title={isLive ? 'Live mode: uses web search (slower, API quota)' : 'Fast mode: uses training knowledge (instant, no quota)'}
      style={{
        display:      'flex',
        alignItems:   'center',
        gap:          '0.375rem',
        padding:      '0.25rem 0.75rem',
        borderRadius: '999px',
        border:       `1px solid ${isLive ? 'rgba(77,199,77,0.4)' : 'rgba(77,159,255,0.3)'}`,
        background:   isLive ? 'rgba(77,199,77,0.1)' : 'rgba(77,159,255,0.08)',
        color:        isLive ? '#4dc74d' : '#4d9fff',
        fontSize:     '0.75rem',
        fontWeight:   600,
        cursor:       'pointer',
        whiteSpace:   'nowrap',
        transition:   'all 0.15s',
      }}
    >
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: isLive ? '#4dc74d' : '#4d9fff', flexShrink: 0 }} />
      {isLive ? 'Live' : 'Fast'}
    </button>
  );
}
