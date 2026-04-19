import type { ReactNode } from 'react';

interface SocialButtonProps {
  label: string;
  bg: string;
  textColor: string;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
  children: ReactNode;
}

export function SocialButton({ label, bg, textColor, onClick, disabled, title, children }: SocialButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="flex items-center justify-center gap-2 rounded-lg py-2 px-3 text-xs font-medium transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
      style={{
        background: bg,
        color:      textColor,
        fontFamily: 'var(--font-body)',
        border:     '1px solid transparent',
      }}
    >
      {children}
      <span>{label}</span>
    </button>
  );
}
