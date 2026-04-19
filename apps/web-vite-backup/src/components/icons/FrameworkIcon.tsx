interface IconProps { size?: number; className?: string; }

export function FrameworkIcon({ size = 32, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <polygon points="16,3 29,12 24,27 8,27 3,12" stroke="#7BAAC8" strokeWidth="2.5" strokeLinejoin="round"/>
      <polygon points="16,9 23,14 20,22 12,22 9,14" stroke="#7BAAC8" strokeWidth="1.8" strokeLinejoin="round"/>
      <circle cx="16" cy="16" r="2" fill="#7BAAC8"/>
    </svg>
  );
}
