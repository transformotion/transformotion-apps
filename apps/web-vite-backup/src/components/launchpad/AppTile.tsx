import { useNavigate } from 'react-router-dom';
import type { AppDefinition } from '../../lib/appRegistry';

interface AppTileProps {
  app: AppDefinition;
  currentPhase?: number;
}

export function AppTile({ app, currentPhase = 1 }: AppTileProps) {
  const navigate = useNavigate();
  const isBuilt  = app.phase <= currentPhase;
  const { Icon, accentColor } = app;

  function handleClick() {
    if (app.external) {
      window.location.href = app.route;
    } else {
      navigate(app.route);
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={!isBuilt}
      className="group w-full text-left rounded-2xl p-5 flex flex-col gap-4 transition-all focus:outline-none disabled:cursor-default"
      style={{
        background:   'var(--color-navy2)',
        border:       `1px solid ${isBuilt ? `color-mix(in srgb, ${accentColor} 25%, transparent)` : 'var(--color-border)'}`,
      }}
      onMouseEnter={(e) => {
        if (isBuilt) {
          (e.currentTarget as HTMLButtonElement).style.borderColor = `color-mix(in srgb, ${accentColor} 55%, transparent)`;
          (e.currentTarget as HTMLButtonElement).style.background = 'var(--color-navy3)';
        }
      }}
      onMouseLeave={(e) => {
        if (isBuilt) {
          (e.currentTarget as HTMLButtonElement).style.borderColor = `color-mix(in srgb, ${accentColor} 25%, transparent)`;
          (e.currentTarget as HTMLButtonElement).style.background = 'var(--color-navy2)';
        }
      }}
    >
      {/* Icon + badge row */}
      <div className="flex items-start justify-between gap-3">
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-105"
          style={{ background: `color-mix(in srgb, ${accentColor} 12%, var(--color-ink))` }}
        >
          <Icon size={26} />
        </div>

        {!isBuilt && (
          <span
            className="text-[10px] font-semibold uppercase tracking-wider rounded-full px-2 py-0.5 mt-1 shrink-0"
            style={{
              color:      'var(--color-text-muted)',
              background: 'var(--color-ink)',
              border:     '1px solid var(--color-border)',
              fontFamily: 'var(--font-sub)',
            }}
          >
            Coming soon
          </span>
        )}

        {isBuilt && (
          <span
            className="text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity mt-1 shrink-0"
            style={{ color: accentColor, fontFamily: 'var(--font-body)' }}
          >
            Open →
          </span>
        )}
      </div>

      {/* Text */}
      <div className="flex flex-col gap-1">
        <h2
          className="text-sm font-semibold text-[var(--color-text-primary)]"
          style={{ fontFamily: 'var(--font-sub)' }}
        >
          {app.name}
        </h2>
        <p
          className="text-xs leading-relaxed line-clamp-2"
          style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-body)' }}
        >
          {app.description}
        </p>
      </div>

      {/* Accent bottom bar — slides in on hover for built apps */}
      {isBuilt && (
        <div
          className="h-px w-0 group-hover:w-full transition-all duration-300 rounded-full"
          style={{ background: `linear-gradient(to right, ${accentColor}, transparent)` }}
        />
      )}
    </button>
  );
}
