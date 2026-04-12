import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './ProtectedRoute';
import { AuthPage } from '../components/auth/AuthPage';
import { AppShell } from '../components/shell/AppShell';
import { LaunchpadPlaceholder } from '../components/shell/LaunchpadPlaceholder';

/**
 * Top-level route table.
 *
 * Public:
 *   /auth       → AuthPage (sign in / sign up / confirm / forgot / reset)
 *
 * Protected (require auth — handled by ProtectedRoute):
 *   /           → AppShell → Launchpad (S1.5)
 *   /stock/*    → Stock Analyser tabs (Phase 3)
 *   /budget/*   → Budget Tracker (Phase 5)
 *
 * Unknown paths redirect to / (which will redirect to /auth if not signed in).
 */
export function AppRouter() {
  return (
    <Routes>
      {/* ── Public ──────────────────────────────────────────────────── */}
      <Route path="/auth" element={<AuthPage />} />

      {/* ── Protected ───────────────────────────────────────────────── */}
      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          {/* Home / Launchpad — wired up properly in S1.5 */}
          <Route index element={<LaunchpadPlaceholder />} />
          {/* Phase 3 — Stock Analyser tabs */}
          <Route path="/stock/*" element={<LaunchpadPlaceholder />} />
          {/* Phase 5 — Budget Tracker */}
          <Route path="/budget/*" element={<LaunchpadPlaceholder />} />
        </Route>
      </Route>

      {/* ── Fallback ────────────────────────────────────────────────── */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
