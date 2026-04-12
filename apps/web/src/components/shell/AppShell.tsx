/**
 * AppShell — the outer chrome for authenticated users.
 *
 * Layout:
 *   Mobile  (< 768px): header + scrollable content + fixed bottom tab nav
 *   Desktop (≥ 768px): sidebar nav + content area
 *
 * Tab routing and Launchpad content are wired up in S1.5 / S1.6.
 * For now, renders a welcome placeholder.
 */

import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

const NAV_ITEMS = [
  { to: '/stock',    label: 'Market',    icon: '📈' },
  { to: '/stock/analyse', label: 'Analyse',  icon: '🔍' },
  { to: '/stock/portfolio', label: 'Portfolio', icon: '💼' },
  { to: '/stock/watchlist', label: 'Watchlist', icon: '⭐' },
  { to: '/',         label: 'Home',      icon: '🏠' },
];

function navClass(isActive: boolean, base = '') {
  const active = 'text-[var(--color-accent)]';
  const inactive = 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]';
  return `${base} ${isActive ? active : inactive} transition-colors`;
}

export function AppShell() {
  const { user, signOut } = useAuth();

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
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                navClass(isActive, 'flex items-center gap-3 px-5 py-3 text-sm w-full')
              }
            >
              <span className="text-base">{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="px-5 py-4 border-t border-[var(--color-border)]">
          <p className="text-xs text-[var(--color-text-muted)] truncate mb-2">{user?.email}</p>
          <button
            onClick={signOut}
            className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-danger)] transition-colors"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* ── Main content column ──────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-h-0">

        {/* Mobile header */}
        <header className="md:hidden flex items-center justify-between px-4 h-12 shrink-0 border-b border-[var(--color-border)] bg-[var(--color-bg-surface)]">
          <span className="text-[var(--color-accent)] font-bold tracking-tight">Transformotion</span>
          <button
            onClick={signOut}
            className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-danger)] transition-colors"
          >
            Sign out
          </button>
        </header>

        {/* Page content — child routes render here in S1.5/S1.6 */}
        <main className="flex-1 overflow-y-auto pb-[var(--bottom-nav-height)] md:pb-0 p-4">
          <Outlet />
        </main>
      </div>

      {/* ── Mobile bottom tab nav ─────────────────────────────────────── */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 h-[var(--bottom-nav-height)] flex items-stretch bg-[var(--color-bg-surface)] border-t border-[var(--color-border)] z-50">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              navClass(isActive, 'flex-1 flex flex-col items-center justify-center gap-0.5')
            }
          >
            <span className="text-lg leading-none">{item.icon}</span>
            <span className="text-[10px] font-medium">{item.label}</span>
          </NavLink>
        ))}
      </nav>

    </div>
  );
}
