/**
 * AppShell — the outer chrome for authenticated users.
 *
 * Sidebar nav (desktop) and bottom tab nav (mobile) are driven by the
 * user's accessible apps from the app registry + a Home/Launchpad entry.
 *
 * Tab routing stubs for all Stock Analyser tabs are wired up in S1.6.
 * For now, child routes render via <Outlet />.
 *
 * Layout:
 *   Mobile  (< 768px): header + scrollable content + fixed bottom tab nav
 *   Desktop (≥ 768px): sidebar nav + content area
 */

import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { getAccessibleApps } from '../../lib/appRegistry';

function navCls(isActive: boolean) {
  return isActive
    ? 'text-[var(--color-accent)]'
    : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]';
}

export function AppShell() {
  const { user, signOut } = useAuth();
  const accessibleApps    = getAccessibleApps(user?.groups ?? []);

  // Sidebar / bottom nav: Home + one entry per accessible app
  const navItems = [
    { to: '/',  label: 'Home',   icon: '🏠',  end: true },
    ...accessibleApps.map((app) => ({
      to:    app.route,
      label: app.name.split(' ')[0], // first word: "Stock", "Budget", "Transformotion"
      icon:  app.icon,
      end:   false,
    })),
  ];

  return (
    <div className="flex flex-col h-full md:flex-row">

      {/* ── Desktop sidebar ──────────────────────────────────────────── */}
      <aside className="hidden md:flex md:flex-col md:w-56 md:shrink-0 border-r border-[var(--color-border)] bg-[var(--color-bg-surface)]">

        {/* Logo */}
        <div className="px-5 py-4 border-b border-[var(--color-border)]">
          <NavLink to="/" className="text-[var(--color-accent)] font-bold text-lg tracking-tight">
            Transformotion
          </NavLink>
        </div>

        {/* Nav links */}
        <nav className="flex-1 py-3">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-5 py-3 text-sm w-full transition-colors ${navCls(isActive)}`
              }
            >
              <span className="text-base">{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* User + sign out */}
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
          <NavLink to="/" className="text-[var(--color-accent)] font-bold tracking-tight">
            Transformotion
          </NavLink>
          <button
            onClick={signOut}
            className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-danger)] transition-colors"
          >
            Sign out
          </button>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto pb-[var(--bottom-nav-height)] md:pb-0 px-4 py-4">
          <Outlet />
        </main>
      </div>

      {/* ── Mobile bottom tab nav (max 5 items) ──────────────────────── */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 h-[var(--bottom-nav-height)] flex items-stretch bg-[var(--color-bg-surface)] border-t border-[var(--color-border)] z-50">
        {navItems.slice(0, 5).map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors ${navCls(isActive)}`
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
