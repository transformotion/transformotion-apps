import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './ProtectedRoute';
import { AuthPage } from '../components/auth/AuthPage';
import { OAuthCallback } from '../components/auth/OAuthCallback';
import { AppShell } from '../components/shell/AppShell';
import { Launchpad } from '../components/launchpad/Launchpad';
import { LaunchpadPlaceholder } from '../components/shell/LaunchpadPlaceholder';
import { StockShell, StockRedirect } from '../components/stock/StockShell';
import { MarketPage }    from '../pages/stock/MarketPage';
import { RecsPage }      from '../pages/stock/RecsPage';
import { EtfsPage }      from '../pages/stock/EtfsPage';
import { MetalsPage }    from '../pages/stock/MetalsPage';
import { AnalysePage }   from '../pages/stock/AnalysePage';
import { PortfolioPage } from '../pages/stock/PortfolioPage';
import { WatchlistPage } from '../pages/stock/WatchlistPage';

/**
 * Top-level route table.
 *
 * Public:
 *   /auth              → AuthPage
 *
 * Protected (gated by ProtectedRoute):
 *   /                  → Launchpad (group-based app tiles)
 *
 *   /stock             → redirect → /stock/market
 *   /stock/market      → Market Analysis
 *   /stock/recs        → Recommendations
 *   /stock/etfs        → ETFs
 *   /stock/metals      → Precious Metals
 *   /stock/analyse     → Analyser
 *   /stock/portfolio   → Portfolio
 *   /stock/watchlist   → Watchlist
 *
 *   /budget/*          → Budget Tracker (Phase 5)
 *   /framework/*       → Transformotion Framework (Phase 6)
 */
export function AppRouter() {
  return (
    <Routes>
      {/* ── Public ──────────────────────────────────────────────────── */}
      <Route path="/auth"     element={<AuthPage />} />
      <Route path="/callback" element={<OAuthCallback />} />

      {/* ── Protected ───────────────────────────────────────────────── */}
      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>

          {/* Home — Launchpad */}
          <Route index element={<Launchpad />} />

          {/* Stock Signal Analyser — 7 tabs */}
          <Route path="stock" element={<StockShell />}>
            <Route index element={<StockRedirect />} />
            <Route path="market"    element={<MarketPage />} />
            <Route path="recs"      element={<RecsPage />} />
            <Route path="etfs"      element={<EtfsPage />} />
            <Route path="metals"    element={<MetalsPage />} />
            <Route path="analyse"   element={<AnalysePage />} />
            <Route path="portfolio" element={<PortfolioPage />} />
            <Route path="watchlist" element={<WatchlistPage />} />
          </Route>

          {/* Budget Tracker — Phase 5 */}
          <Route path="budget/*" element={<LaunchpadPlaceholder />} />

          {/* Transformotion Framework — Phase 6 */}
          <Route path="framework/*" element={<LaunchpadPlaceholder />} />

        </Route>
      </Route>

      {/* ── Fallback ────────────────────────────────────────────────── */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
