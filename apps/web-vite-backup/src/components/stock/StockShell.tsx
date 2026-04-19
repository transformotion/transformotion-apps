/**
 * StockShell — inner shell for the Stock Signal Analyser app.
 *
 * Sits inside AppShell's <Outlet /> so the outer chrome (sidebar / bottom
 * app-switcher nav) is already present. This component adds the 7-tab
 * navigation specific to the Stock Analyser.
 *
 * Tab strip design:
 *   Desktop (≥ 768px): fixed horizontal tab row at the top, full-width
 *   Mobile  (< 768px): horizontally scrollable tab strip (no wrapping)
 *     — does NOT conflict with AppShell's bottom nav which handles app switching
 *
 * All 7 tabs map to sub-routes under /stock/* and are filled in Phase 3.
 */

import { Component, type ReactNode } from 'react';
import { NavLink, Outlet, Navigate } from 'react-router-dom';

// ── TabErrorBoundary ──────────────────────────────────────────────────────────

interface EBState { error: Error | null }

class TabErrorBoundary extends Component<{ children: ReactNode }, EBState> {
  state: EBState = { error: null };
  static getDerivedStateFromError(error: Error): EBState { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: '2rem 1rem', maxWidth: 600, margin: '0 auto' }}>
          <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, padding: '1rem' }}>
            <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#ef4444', marginBottom: '0.5rem' }}>
              Something went wrong rendering this tab
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {this.state.error.message}
            </div>
            <button
              onClick={() => this.setState({ error: null })}
              style={{ marginTop: '0.75rem', fontSize: '0.75rem', padding: '4px 12px', borderRadius: 6, border: '1px solid rgba(239,68,68,0.4)', background: 'transparent', color: '#ef4444', cursor: 'pointer' }}
            >
              Try again
            </button>
          </div>
        </div>
      );
    }
    return this.state.error === null ? this.props.children : null;
  }
}

export const STOCK_TABS = [
  { path: 'market',    label: 'Market Analysis', short: 'Market'    },
  { path: 'recs',      label: 'Recommendations', short: 'Recs'      },
  { path: 'etfs',      label: 'ETFs',            short: 'ETFs'      },
  { path: 'metals',    label: 'Precious Metals', short: 'Metals'    },
  { path: 'analyse',   label: 'Analyser',        short: 'Analyse'   },
  { path: 'portfolio', label: 'Portfolio',       short: 'Portfolio' },
  { path: 'watchlist', label: 'Watchlist',       short: 'Watchlist' },
] as const;

export type StockTabPath = typeof STOCK_TABS[number]['path'];

export function StockShell() {
  return (
    <div className="flex flex-col h-full -mx-4 -mt-4">

      {/* ── Tab strip ──────────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-[var(--color-border)] bg-[var(--color-bg-surface)]">
        {/*
          overflow-x-auto + flex: tabs scroll horizontally on mobile.
          scrollbar-none hides the scrollbar without losing scroll ability.
        */}
        <nav
          className="flex overflow-x-auto px-4 gap-0"
          style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
        >
          {STOCK_TABS.map((tab) => (
            <NavLink
              key={tab.path}
              to={`/stock/${tab.path}`}
              className={({ isActive }) =>
                [
                  'shrink-0 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
                  isActive
                    ? 'border-[var(--color-accent)] text-[var(--color-accent)]'
                    : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-border-light)]',
                ].join(' ')
              }
            >
              {/* Show full label on desktop, short label on mobile */}
              <span className="hidden md:inline">{tab.label}</span>
              <span className="md:hidden">{tab.short}</span>
            </NavLink>
          ))}
        </nav>
      </div>

      {/* ── Tab content ─────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <TabErrorBoundary>
          <Outlet />
        </TabErrorBoundary>
      </div>

    </div>
  );
}

/**
 * Redirect /stock → /stock/market (default tab).
 * Used as the index route for the /stock prefix.
 */
export function StockRedirect() {
  return <Navigate to="/stock/market" replace />;
}
