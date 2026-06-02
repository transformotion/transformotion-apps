import type { CandlestickSeriesOptions } from 'lightweight-charts';

export const CHART_THEME = {
  text:        '#6b7280',
  grid:        '#253244',
  signalGreen: '#1D9E75',
  signalRed:   '#D4537E',
} as const;

export const CANDLESTICK_COLORS: Partial<CandlestickSeriesOptions> = {
  upColor:         CHART_THEME.signalGreen,
  downColor:       CHART_THEME.signalRed,
  borderUpColor:   CHART_THEME.signalGreen,
  borderDownColor: CHART_THEME.signalRed,
  wickUpColor:     CHART_THEME.signalGreen,
  wickDownColor:   CHART_THEME.signalRed,
};
