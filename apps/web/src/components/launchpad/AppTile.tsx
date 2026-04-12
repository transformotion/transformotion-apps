import { useNavigate } from 'react-router-dom';
import type { AppDefinition } from '../../lib/appRegistry';

interface AppTileProps {
  app: AppDefinition;
  /** Current phase of development — tiles for future phases show a badge. */
  currentPhase?: number;
}

export function AppTile({ app, currentPhase = 1 }: AppTileProps) {
  const navigate = useNavigate();
  const isBuilt  = app.phase <= currentPhase;

  return (
    <button
      onClick={() => navigate(app.route)}
      disabled={!isBuilt}
      className="group w-full text-left rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-surface)] p-5 flex flex-col gap-4 transition-all hover:border-[var(--color-border-light)] hover:bg-[var(--color-bg-surface2)] disabled:opacity-60 disabled:cursor-default focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
      style={isBuilt ? { ['--tile-accent' as string]: app.accentColor } : {}}
    >
      {/* Icon + badge row */}
      <div className="flex items-start justify-between gap-3">
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0 transition-transform group-hover:scale-105"
          style={{ background: isBuilt ? `color-mix(in srgb, ${app.accentColor} 15%, var(--color-bg-surface2))` : 'var(--color-bg-surface2)' }}
        >
          {app.icon}
        </div>
        {!isBuilt && (
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)] bg-[var(--color-bg-surface2)] border border-[var(--color-border)] rounded-full px-2 py-0.5 mt-1">
            Coming soon
          </span>
        )}
        {isBuilt && (
          <span
            className="text-xs font-semibold opacity-0 group-hover:opacity-100 transition-opacity mt-1 pr-0.5"
            style={{ color: app.accentColor }}
          >
            Open →
          </span>
        )}
      </div>

      {/* Text */}
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">{app.name}</h2>
        <p className="text-xs text-[var(--color-text-muted)] leading-relaxed line-clamp-2">{app.description}</p>
      </div>

      {/* Accent bottom bar — visible on hover for built apps */}
      {isBuilt && (
        <div
          className="h-0.5 w-0 group-hover:w-full transition-all duration-300 rounded-full"
          style={{ background: app.accentColor }}
        />
      )}
    </button>
  );
}
