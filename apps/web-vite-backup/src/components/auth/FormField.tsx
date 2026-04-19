interface FormFieldProps {
  id: string;
  label: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoComplete?: string;
  disabled?: boolean;
  error?: string;
}

export function FormField({
  id, label, type = 'text', value, onChange,
  placeholder, autoComplete, disabled, error,
}: FormFieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={id}
        className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]"
        style={{ fontFamily: 'var(--font-sub)' }}
      >
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        disabled={disabled}
        className="w-full rounded-lg px-3 py-2.5 text-sm focus:outline-none disabled:opacity-50 transition-colors"
        style={{
          background:   'var(--color-ink)',
          border:       `1px solid ${error ? 'var(--color-danger)' : 'var(--color-border)'}`,
          color:        'var(--color-text-primary)',
          fontFamily:   'var(--font-body)',
          // teal focus ring handled inline via onFocus/onBlur
        }}
        onFocus={(e) => !error && (e.target.style.borderColor = 'var(--color-teal)')}
        onBlur={(e) => !error && (e.target.style.borderColor = 'var(--color-border)')}
      />
      {error && (
        <p className="text-xs text-[var(--color-danger)]" style={{ fontFamily: 'var(--font-body)' }}>
          {error}
        </p>
      )}
    </div>
  );
}
