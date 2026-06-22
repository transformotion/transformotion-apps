import type { CandlestickSeriesOptions } from 'lightweight-charts';
import { chartColorTokens, semanticThemeTokens, statusTokens } from '@transformotion/brand-tokens';

export const CHART_THEME = {
  text:        semanticThemeTokens.light.mutedForeground,
  grid:        chartColorTokens.chart3.light,
  signalGreen: statusTokens.success.light,
  signalRed:   statusTokens.destructive.light,
} as const;

export const CANDLESTICK_COLORS: Partial<CandlestickSeriesOptions> = {
  upColor:         CHART_THEME.signalGreen,
  downColor:       CHART_THEME.signalRed,
  borderUpColor:   CHART_THEME.signalGreen,
  borderDownColor: CHART_THEME.signalRed,
  wickUpColor:     CHART_THEME.signalGreen,
  wickDownColor:   CHART_THEME.signalRed,
};
