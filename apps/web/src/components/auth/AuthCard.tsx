import type { ReactNode } from 'react';

interface AuthCardProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  error?: string;
}

export function AuthCard({ title, subtitle, children, error }: AuthCardProps) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8 bg-[var(--color-bg-primary)]">
      <div className="w-full max-w-sm">
        {/* Logo mark */}
        <div className="flex justify-center mb-6">
          <div className="w-12 h-12 rounded-2xl bg-[var(--color-bg-surface)] border border-[var(--color-border)] flex items-center justify-center text-xl">
            📊
          </div>
        </div>

        {/* Heading */}
        <h1 className="text-xl font-semibold text-[var(--color-text-primary)] text-center mb-1">
          {title}
        </h1>
        {subtitle && (
          <p className="text-sm text-[var(--color-text-muted)] text-center mb-6">
            {subtitle}
          </p>
        )}
        {!subtitle && <div className="mb-6" />}

        {/* Card */}
        <div className="bg-[var(--color-bg-surface)] border border-[var(--color-border)] rounded-2xl p-6 flex flex-col gap-4">
          {/* Global error banner */}
          {error && (
            <div className="bg-[var(--color-danger-bg)] border border-[var(--color-danger)] rounded-lg px-3 py-2.5 text-sm text-[var(--color-danger)]">
              {error}
            </div>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}
