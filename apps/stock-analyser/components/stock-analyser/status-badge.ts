type StockSignal = "BUY" | "ENTER" | "HOLD" | "WATCH" | "SELL" | "EXIT" | "NEUTRAL" | string

export function stockSignalBadgeClassName(signal: StockSignal): string {
  // Includes the #592 recommendationSignal vocabulary (lowercase): pick (positive) /
  // watch (neutral) / avoid (caution), mapped to the same badge-tone families.
  const tone = signal === "BUY" || signal === "ENTER" || signal === "pick"
    ? "bg-signal-green text-white"
    : signal === "SELL" || signal === "EXIT" || signal === "avoid"
      ? "bg-signal-red text-white"
      : signal === "HOLD" || signal === "WATCH" || signal === "watch"
        ? "bg-signal-amber/80 text-background"
        : "bg-muted/50 text-muted-foreground"

  return `px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${tone}`
}
