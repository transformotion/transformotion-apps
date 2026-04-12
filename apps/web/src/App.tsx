/**
 * App shell — Phase 1.
 *
 * Routing logic:
 *   isLoading        → full-screen spinner (Cognito session check in progress)
 *   !isAuthenticated → AuthPage (Sign In / Sign Up / Confirm / Forgot / Reset)
 *   isAuthenticated  → main shell with nav + content (Launchpad wired up in S1.5)
 *
 * Layout:
 *   Mobile  (< 768px): header + scrollable content + fixed bottom tab nav
 *   Desktop (≥ 768px): sidebar nav + content area
 */

import { useAuth } from './contexts/AuthContext';
import { AuthPage } from './components/auth/AuthPage';

const NAV_ITEMS = [
  { id: 'market',    label: 'Market',    icon: '📈' },
  { id: 'stocks',    label: 'Stocks',    icon: '🔍' },
  { id: 'portfolio', label: 'Portfolio', icon: '💼' },
  { id: 'watchlist', label: 'Watchlist', icon: '⭐' },
  { id: 'settings',  label: 'Settings',  icon: '⚙️' },
];

export default function App() {
  const { isAuthenticated, isLoading, user, signOut } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg-primary)]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-[var(--color-border)] border-t-[var(--color-accent)] rounded-full animate-spin" />
          <p className="text-sm text-[var(--color-text-muted)]">Loading…</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <AuthPage />;
  }

  return (
    <div className="flex flex-col h-full md:flex-row">

      {/* ── Desktop sidebar ──────────────────────────────────────────── */}
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
        <div className="px-5 py-4 border-t border-[var(--color-border)]">
          <p className="text-xs text-[var(--color-text-muted)] truncate mb-2">{user?.email}</p>
          <button
            onClick={signOut}
            className="w-full text-left text-xs text-[var(--color-text-muted)] hover:text-[var(--color-danger)] transition-colors"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* ── Main content column ──────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-h-0">

        {/* Mobile header */}
        <header className="md:hidden flex items-center justify-between px-4 h-12 shrink-0 border-b border-[var(--color-border)] bg-[var(--color-bg-surface)]">
          <span className="text-[var(--color-accent)] font-bold tracking-tight">
            Transformotion
          </span>
          <button
            onClick={signOut}
            className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-danger)] transition-colors"
          >
            Sign out
          </button>
        </header>

        {/* Scrollable page content */}
        <main className="flex-1 overflow-y-auto pb-[var(--bottom-nav-height)] md:pb-0 p-4">
          <WelcomePlaceholder name={user?.email?.split('@')[0] ?? 'there'} />
        </main>
      </div>

      {/* ── Mobile bottom tab nav ─────────────────────────────────────── */}
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

function WelcomePlaceholder({ name }: { name: string }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center">
      <div className="w-16 h-16 rounded-2xl bg-[var(--color-bg-surface2)] flex items-center justify-center text-3xl">
        👋
      </div>
      <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">
        Welcome, {name}!
      </h1>
      <p className="text-sm text-[var(--color-text-muted)] max-w-xs">
        You're signed in. Launchpad and app routing are coming in S1.5.
      </p>
    </div>
  );
}
