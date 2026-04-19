interface IconProps { size?: number; className?: string; }

export function BudgetIcon({ size = 32, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <rect x="3" y="8" width="26" height="18" rx="3" stroke="#E8A838" strokeWidth="2.5"/>
      <path d="M3 13h26" stroke="#E8A838" strokeWidth="2" strokeLinecap="round"/>
      <rect x="20" y="17" width="6" height="4" rx="1" fill="#E8A838"/>
      <path d="M7 18h6M7 22h4" stroke="#E8A838" strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  );
}
