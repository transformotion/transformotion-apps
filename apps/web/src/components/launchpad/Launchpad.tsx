import { useAuth } from '../../contexts/AuthContext';
import { getAccessibleApps } from '../../lib/appRegistry';
import { AppTile } from './AppTile';

/**
 * Launchpad — the home screen after sign-in.
 *
 * Renders an app tile for each app the user has access to, based on their
 * cognito:groups JWT claim. Users with no groups see an "awaiting access"
 * message rather than an empty screen.
 *
 * Layout:
 *   Mobile (< 640px):  single column
 *   sm (≥ 640px):      2-column grid
 *   lg (≥ 1024px):     3-column grid
 */
export function Launchpad() {
  const { user } = useAuth();
  const groups   = user?.groups ?? [];
  const apps     = getAccessibleApps(groups);
  const name     = user?.email?.split('@')[0] ?? 'there';

  return (
    <div className="max-w-3xl mx-auto py-6 px-0">
      {/* Greeting */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">
          Good {timeOfDay()}, {name}
        </h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">
          {apps.length > 0
            ? 'Select an app to get started.'
            : 'Your account is set up — you\'ll be added to apps shortly.'}
        </p>
      </div>

      {apps.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {apps.map((app) => (
            <AppTile key={app.id} app={app} currentPhase={1} />
          ))}
        </div>
      ) : (
        <NoApps groups={groups} />
      )}
    </div>
  );
}

/** Shown when the user has no Cognito group memberships yet. */
function NoApps({ groups }: { groups: string[] }) {
  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-surface)] p-8 flex flex-col items-center text-center gap-4">
      <div className="w-14 h-14 rounded-2xl bg-[var(--color-bg-surface2)] flex items-center justify-center text-2xl">
        🔒
      </div>
      <div>
        <h2 className="text-base font-semibold text-[var(--color-text-primary)] mb-1">
          No apps assigned yet
        </h2>
        <p className="text-sm text-[var(--color-text-muted)] max-w-xs">
          You're signed in but haven't been granted access to any apps.
          {groups.includes('family')
            ? ' Ask the account owner to add you to Stock Signal Analyser or Budget Tracker.'
            : ' Contact the platform administrator to be added to an app group.'}
        </p>
      </div>
      {/* Dev hint — only visible in development builds */}
      {import.meta.env.DEV && (
        <p className="text-xs text-[var(--color-warning)] bg-[var(--color-warning-bg)] border border-[var(--color-warning)] rounded-lg px-3 py-2 max-w-xs">
          Dev: add this user to the <code className="font-mono">stock-app</code>, <code className="font-mono">budget-app</code>, or <code className="font-mono">admin</code> group in the Cognito console to see tiles.
        </p>
      )}
    </div>
  );
}

function timeOfDay(): string {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}
