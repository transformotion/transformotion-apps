interface IconProps { size?: number; className?: string; }

export function UserPlusIcon({ size = 32, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <circle cx="13" cy="10" r="5" stroke="#00C4B3" strokeWidth="2.5"/>
      <path d="M3 26c0-5.5 4.5-9 10-9s10 3.5 10 9" stroke="#00C4B3" strokeWidth="2.5" strokeLinecap="round"/>
      <line x1="24" y1="14" x2="24" y2="22" stroke="#00C4B3" strokeWidth="2.5" strokeLinecap="round"/>
      <line x1="20" y1="18" x2="28" y2="18" stroke="#00C4B3" strokeWidth="2.5" strokeLinecap="round"/>
    </svg>
  );
}
