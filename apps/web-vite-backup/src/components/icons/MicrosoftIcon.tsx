interface IconProps { size?: number }

/** Microsoft four-square logo — used on the Sign In social button. */
export function MicrosoftIcon({ size = 18 }: IconProps) {
  const half = size / 2 - 1;
  const gap  = 1;
  return (
    <svg width={size} height={size} viewBox="0 0 21 21" aria-hidden="true">
      <rect x="0"          y="0"          width={half} height={half} fill="#f25022"/>
      <rect x={half + gap} y="0"          width={half} height={half} fill="#00a4ef"/>
      <rect x="0"          y={half + gap} width={half} height={half} fill="#7fba00"/>
      <rect x={half + gap} y={half + gap} width={half} height={half} fill="#ffb900"/>
    </svg>
  );
}
