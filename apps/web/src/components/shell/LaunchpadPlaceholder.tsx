import { useAuth } from '../../contexts/AuthContext';

/**
 * Temporary placeholder rendered at "/" until S1.5 (Launchpad) replaces it.
 */
export function LaunchpadPlaceholder() {
  const { user } = useAuth();
  const name = user?.email?.split('@')[0] ?? 'there';

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center">
      <div className="w-16 h-16 rounded-2xl bg-[var(--color-bg-surface2)] flex items-center justify-center text-3xl">
        👋
      </div>
      <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">
        Welcome, {name}!
      </h1>
      <p className="text-sm text-[var(--color-text-muted)] max-w-xs">
        Launchpad coming in S1.5 — auth and routing are fully wired.
      </p>
      <div className="mt-2 grid grid-cols-1 gap-3 w-full max-w-xs">
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
