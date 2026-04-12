/**
 * Shared stub component for all 7 Stock Analyser tab pages.
 * Replaced with real content in Phase 3.
 */
interface TabStubProps {
  icon: string;
  label: string;
  description: string;
  phase: string;
}

export function TabStub({ icon, label, description, phase }: TabStubProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4 text-center max-w-sm mx-auto">
      <div className="w-14 h-14 rounded-2xl bg-[var(--color-bg-surface2)] flex items-center justify-center text-2xl">
        {icon}
      </div>
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold text-[var(--color-text-primary)]">{label}</h2>
        <p className="text-sm text-[var(--color-text-muted)] leading-relaxed">{description}</p>
      </div>
      <span className="text-xs font-medium text-[var(--color-text-muted)] bg-[var(--color-bg-surface2)] border border-[var(--color-border)] rounded-full px-3 py-1">
        {phase}
      </span>
    </div>
  );
}
