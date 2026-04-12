import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './ProtectedRoute';
import { AuthPage } from '../components/auth/AuthPage';
import { AppShell } from '../components/shell/AppShell';
import { Launchpad } from '../components/launchpad/Launchpad';
import { LaunchpadPlaceholder } from '../components/shell/LaunchpadPlaceholder';

/**
 * Top-level route table.
 *
 * Public:
 *   /auth       → AuthPage (sign in / sign up / confirm / forgot / reset)
 *
 * Protected (require auth — gated by ProtectedRoute):
 *   /           → Launchpad (group-based app tiles)
 *   /stock/*    → Stock Analyser app shell + tabs  (Phase 3, S3.x)
 *   /budget/*   → Budget Tracker                   (Phase 5, S5.x)
 *   /framework  → Transformotion Framework          (Phase 6)
 *
 * Unknown paths → / (which redirects to /auth if not signed in).
 */
export function AppRouter() {
  return (
    <Routes>
      {/* ── Public ──────────────────────────────────────────────────── */}
      <Route path="/auth" element={<AuthPage />} />

      {/* ── Protected ───────────────────────────────────────────────── */}
      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          {/* Home — Launchpad */}
          <Route index element={<Launchpad />} />

          {/* Stock Analyser — tab shell stubbed in S1.6 */}
          <Route path="/stock/*" element={<LaunchpadPlaceholder />} />

          {/* Budget Tracker — Phase 5 */}
          <Route path="/budget/*" element={<LaunchpadPlaceholder />} />

          {/* Transformotion Framework — Phase 6 */}
          <Route path="/framework/*" element={<LaunchpadPlaceholder />} />
        </Route>
      </Route>

      {/* ── Fallback ────────────────────────────────────────────────── */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
