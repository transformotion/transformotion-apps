import type { ReactNode } from 'react';
import { Wordmark } from '../Wordmark';

interface AuthCardProps {
  title: string;
  subtitle?: string;
  /** Optional SVG icon rendered between wordmark and card (e.g. UserPlusIcon on sign-up). */
  icon?: ReactNode;
  children: ReactNode;
  error?: string;
}

export function AuthCard({ title, subtitle, icon, children, error }: AuthCardProps) {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4 py-8"
      style={{ background: 'var(--color-navy)' }}
    >
      <div className="w-full max-w-sm">

        {/* Wordmark — all auth screens */}
        <div className="flex justify-center mb-6">
          <Wordmark />
        </div>

        {/* Optional per-screen icon (e.g. UserPlus on sign-up) */}
        {icon && (
          <div className="flex justify-center mb-4">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{
                background: 'color-mix(in srgb, #00C4B3 10%, var(--color-navy2))',
                border:     '1px solid color-mix(in srgb, #00C4B3 30%, transparent)',
              }}
            >
              {icon}
            </div>
          </div>
        )}

        {/* Heading */}
        <h1
          className="text-xl font-semibold text-[var(--color-text-primary)] text-center mb-1"
          style={{ fontFamily: 'var(--font-sub)' }}
        >
          {title}
        </h1>
        {subtitle && (
          <p
            className="text-sm text-[var(--color-text-muted)] text-center mb-6"
            style={{ fontFamily: 'var(--font-body)' }}
          >
            {subtitle}
          </p>
        )}
        {!subtitle && <div className="mb-6" />}

        {/* Card */}
        <div
          className="rounded-2xl p-6 flex flex-col gap-4"
          style={{
            background: 'var(--color-navy2)',
            border:     '1px solid var(--color-border)',
          }}
        >
          {error && (
            <div
              className="rounded-lg px-3 py-2.5 text-sm"
              style={{
                background: 'var(--color-danger-bg)',
                border:     '1px solid var(--color-danger)',
                color:      'var(--color-danger)',
                fontFamily: 'var(--font-body)',
              }}
            >
              {error}
            </div>
          )}
          {children}
        </div>

      </div>
    </div>
  );
}
