interface IconProps { size?: number; className?: string; }

export function StockIcon({ size = 32, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <polyline points="4,24 10,16 16,20 22,10 28,6" stroke="#00C4B3" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
      <line x1="4" y1="28" x2="28" y2="28" stroke="#00C4B3" strokeWidth="2" strokeLinecap="round"/>
      <line x1="4" y1="28" x2="4" y2="4" stroke="#00C4B3" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );
}
