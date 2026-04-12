/**
 * App shell — Phase 1 scaffold.
 *
 * Layout:
 *   Mobile  (< 768px): stacked — header + scrollable content + bottom tab nav
 *   Desktop (≥ 768px): sidebar nav + content area side-by-side
 *
 * Auth and routing will be wired up in S1.2–S1.5.
 * This component exists solely to verify the dark theme and
 * mobile-first layout render correctly before any further work.
 */

const NAV_ITEMS = [
  { id: 'market',      label: 'Market',      icon: '📈' },
  { id: 'stocks',      label: 'Stocks',      icon: '🔍' },
  { id: 'portfolio',   label: 'Portfolio',   icon: '💼' },
  { id: 'watchlist',   label: 'Watchlist',   icon: '⭐' },
  { id: 'settings',    label: 'Settings',    icon: '⚙️' },
];

export default function App() {
  return (
    <div className="flex flex-col h-full md:flex-row">

      {/* ── Desktop sidebar (hidden on mobile) ─────────────────────── */}
      <aside className="hidden md:flex md:flex-col md:w-56 md:shrink-0 border-r border-[var(--color-border)] bg-[var(--color-bg-surface)]">
        <div className="px-5 py-4 border-b border-[var(--color-border)]">
          <span className="text-[var(--color-accent)] font-bold text-lg tracking-tight">
            Transformotion
          </span>
        </div>
        <nav className="flex-1 py-3">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              className="w-full flex items-center gap-3 px-5 py-3 text-sm text-left text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-surface2)] transition-colors"
            >
              <span className="text-base">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      {/* ── Main content column ─────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-h-0">

        {/* Mobile header */}
        <header className="md:hidden flex items-center justify-between px-4 h-12 shrink-0 border-b border-[var(--color-border)] bg-[var(--color-bg-surface)]">
          <span className="text-[var(--color-accent)] font-bold tracking-tight">
            Transformotion
          </span>
          <button className="text-[var(--color-text-muted)] text-xl leading-none">
            ☰
          </button>
        </header>

        {/* Scrollable page content */}
        <main className="flex-1 overflow-y-auto pb-[var(--bottom-nav-height)] md:pb-0 p-4">
          <Placeholder />
        </main>
      </div>

      {/* ── Mobile bottom tab nav (hidden on desktop) ───────────────── */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 h-[var(--bottom-nav-height)] flex items-stretch bg-[var(--color-bg-surface)] border-t border-[var(--color-border)] z-50">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            className="flex-1 flex flex-col items-center justify-center gap-0.5 text-[var(--color-text-muted)] hover:text-[var(--color-accent)] transition-colors"
          >
            <span className="text-lg leading-none">{item.icon}</span>
            <span className="text-[10px] font-medium">{item.label}</span>
          </button>
        ))}
      </nav>

    </div>
  );
}

/** Temporary content placeholder — replaced in S1.5 (Launchpad). */
function Placeholder() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center">
      <div className="w-16 h-16 rounded-2xl bg-[var(--color-bg-surface2)] flex items-center justify-center text-3xl">
        📊
      </div>
      <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">
        Transformotion Apps
      </h1>
      <p className="text-sm text-[var(--color-text-muted)] max-w-xs">
        Phase 1 scaffold — auth &amp; routing coming in S1.2–S1.5.
      </p>
      <div className="mt-4 grid grid-cols-1 gap-3 w-full max-w-xs">
        {['Stock Signal Analyser', 'Budget Tracker', 'Transformotion Framework'].map((app) => (
          <div
            key={app}
            className="rounded-xl bg-[var(--color-bg-surface)] border border-[var(--color-border)] p-4 text-left"
          >
            <p className="text-sm font-medium text-[var(--color-text-primary)]">{app}</p>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">Coming soon</p>
          </div>
        ))}
      </div>
    </div>
  );
}
