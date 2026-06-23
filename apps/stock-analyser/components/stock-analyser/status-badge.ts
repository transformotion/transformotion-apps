type StockSignal = "BUY" | "ENTER" | "HOLD" | "WATCH" | "SELL" | "EXIT" | "NEUTRAL" | string

export function stockSignalBadgeClassName(signal: StockSignal): string {
  const tone = signal === "BUY" || signal === "ENTER"
    ? "bg-signal-green text-white"
    : signal === "SELL" || signal === "EXIT"
      ? "bg-signal-red text-white"
      : signal === "HOLD" || signal === "WATCH"
        ? "bg-signal-amber/80 text-background"
        : "bg-muted/50 text-muted-foreground"

  return `px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${tone}`
}
