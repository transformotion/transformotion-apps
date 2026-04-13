/**
 * AppShell — outer chrome for authenticated users.
 *
 * Layout:
 *   Fixed top nav (all breakpoints): wordmark left, user + sign-out right
 *   Desktop (≥ 768px): left sidebar for app nav + main content area
 *   Mobile  (< 768px): main content + fixed bottom tab nav for app switching
 *
 * Content area is offset by --top-nav-height (56px) on all sizes,
 * and by --bottom-nav-height (56px) at the bottom on mobile.
 */

import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useFirstLogin } from '../../hooks/useFirstLogin';
import { getAccessibleApps } from '../../lib/appRegistry';
import { Wordmark } from '../Wordmark';
import { MigrationBanner } from '../MigrationBanner';

function navCls(isActive: boolean) {
  return isActive
    ? 'text-[var(--color-teal)]'
    : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]';
}

export function AppShell() {
  const { user, signOut } = useAuth();
  const accessibleApps    = getAccessibleApps(user?.groups ?? []);

  // First-login: create personal account + set Cognito custom attributes if absent
  const { setupError } = useFirstLogin();

  const navItems = [
    { to: '/', label: 'Home', end: true },
    ...accessibleApps.map((app) => ({
      to:    app.route,
      label: app.name.split(' ')[0],
      end:   false,
    })),
  ];

  return (
    <div className="flex flex-col h-full">

      {/* ── Fixed top nav ────────────────────────────────────────────── */}
      <header
        className="fixed inset-x-0 top-0 z-50 h-[var(--top-nav-height)] flex items-center px-4 md:px-6"
        style={{
          background:       'rgba(13, 27, 42, 0.88)',
          backdropFilter:   'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderBottom:     '1px solid var(--color-border)',
        }}
      >
        {/* Logo */}
        <NavLink to="/" className="shrink-0 mr-auto">
          <Wordmark />
        </NavLink>

        {/* Desktop: nav links */}
        <nav className="hidden md:flex items-center gap-1 mr-6">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `px-3 py-1.5 rounded-md text-sm transition-colors ${navCls(isActive)}`
              }
              style={{ fontFamily: 'var(--font-body)' }}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* User + sign out */}
        <div className="flex items-center gap-3 shrink-0">
          <span className="hidden sm:block text-xs text-[var(--color-text-muted)] truncate max-w-[160px]">
            {user?.email}
          </span>
          <button
            onClick={signOut}
            className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-danger)] transition-colors"
          >
            Sign out
          </button>
        </div>
      </header>

      {/* ── Below-nav layout ─────────────────────────────────────────── */}
      <div
        className="flex flex-1 min-h-0"
        style={{ paddingTop: 'var(--top-nav-height)' }}
      >
        {/* Desktop sidebar */}
        <aside className="hidden md:flex flex-col w-[var(--sidebar-width)] shrink-0 border-r border-[var(--color-border)]"
          style={{ background: 'var(--color-ink)' }}>
          <nav className="flex-1 py-4">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-5 py-2.5 text-sm transition-colors ${navCls(isActive)}`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </aside>

        {/* Main content */}
        <main
          className="flex-1 overflow-y-auto px-4 py-4"
          style={{ paddingBottom: 'calc(var(--bottom-nav-height) + 1rem)' }}
        >
          <Outlet />
        </main>
      </div>

      {/* ── First-login setup error (rare, shown as non-blocking toast) ─ */}
      {setupError && (
        <div style={{
          position:    'fixed',
          top:         'calc(var(--top-nav-height) + 0.75rem)',
          right:       '1rem',
          zIndex:      1001,
          background:  '#7f1d1d',
          border:      '1px solid #ef4444',
          borderRadius:'6px',
          padding:     '0.75rem 1rem',
          color:       '#fca5a5',
          fontSize:    '0.875rem',
          maxWidth:    '320px',
        }}>
          Account setup failed: {setupError}
        </div>
      )}

      {/* ── localStorage migration banner ─────────────────────────────── */}
      <MigrationBanner />

      {/* ── Mobile bottom tab nav ─────────────────────────────────────── */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 h-[var(--bottom-nav-height)] flex items-stretch z-50"
        style={{
          background:   'rgba(9, 21, 35, 0.95)',
          backdropFilter: 'blur(8px)',
          borderTop:    '1px solid var(--color-border)',
        }}
      >
        {navItems.slice(0, 5).map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors ${navCls(isActive)}`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

    </div>
  );
}
