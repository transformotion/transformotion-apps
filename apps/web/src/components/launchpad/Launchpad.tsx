import { useAuth } from '../../contexts/AuthContext';
import { getAccessibleApps } from '../../lib/appRegistry';
import { AppTile } from './AppTile';

export function Launchpad() {
  const { user } = useAuth();
  const groups   = user?.groups ?? [];
  const apps     = getAccessibleApps(groups);
  const name     = user?.email?.split('@')[0] ?? 'there';

  return (
    <div className="max-w-3xl mx-auto py-6">

      {/* Greeting */}
      <div className="mb-8">
        <h1
          className="text-3xl text-[var(--color-text-primary)] mb-1"
          style={{ fontFamily: 'var(--font-heading)', letterSpacing: '0.04em' }}
        >
          Good {timeOfDay()}, {name}
        </h1>
        <p className="text-sm text-[var(--color-text-muted)]" style={{ fontFamily: 'var(--font-body)' }}>
          {apps.length > 0
            ? 'Select an app to get started.'
            : "Your account is set up — you'll be added to apps shortly."}
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

function NoApps({ groups }: { groups: string[] }) {
  return (
    <div
      className="rounded-2xl p-8 flex flex-col items-center text-center gap-4"
      style={{ background: 'var(--color-navy2)', border: '1px solid var(--color-border)' }}
    >
      <div
        className="w-14 h-14 rounded-2xl flex items-center justify-center"
        style={{ background: 'var(--color-ink)' }}
      >
        <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
          <rect x="4" y="14" width="24" height="14" rx="3" stroke="var(--color-steel)" strokeWidth="2.5"/>
          <path d="M10 14V10a6 6 0 0112 0v4" stroke="var(--color-steel)" strokeWidth="2.5" strokeLinecap="round"/>
        </svg>
      </div>
      <div>
        <h2
          className="text-base font-semibold text-[var(--color-text-primary)] mb-1"
          style={{ fontFamily: 'var(--font-sub)' }}
        >
          No apps assigned yet
        </h2>
        <p className="text-sm text-[var(--color-text-muted)] max-w-xs" style={{ fontFamily: 'var(--font-body)' }}>
          {groups.includes('family')
            ? 'Ask the account owner to add you to Stock Signal Analyser or Budget Tracker.'
            : 'Contact the platform administrator to be added to an app group.'}
        </p>
      </div>
      {import.meta.env.DEV && (
        <p
          className="text-xs rounded-lg px-3 py-2 max-w-xs"
          style={{
            color:      'var(--color-gold)',
            background: 'var(--color-gold-dim)',
            border:     '1px solid var(--color-gold)',
            fontFamily: 'var(--font-body)',
          }}
        >
          Dev: add this user to <code className="font-mono">stock-app</code>, <code className="font-mono">budget-app</code>, or <code className="font-mono">admin</code> in the Cognito console.
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
