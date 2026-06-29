/**
 * Analyser — per-ticker technical grounding (M19 #602).
 *
 * The analyser schema requires COMPUTED technicals (RSI, MACD, cyclePosition,
 * cycleStage, volumeTrend, signals) that web search CANNOT ground — they are
 * computed from price history, not published facts. In Live two-pass mode the
 * research pass therefore either hard-fails the integrity guard (OpenAI) or
 * fabricates wrong technicals that contradict the app's own cycle gauge AND the
 * other provider (Claude). Empirically (see #602), feeding the real
 * `computeCyclePosition` output in as SUPPLIED DATA makes BOTH providers emit the
 * real, gauge-matching technicals — the same pattern Market already uses
 * (`buildSectorSuppliedData`). Web search still supplies the qualitative facts
 * (company/news/listing/risks); computation supplies the technicals.
 *
 * If OHLCV is genuinely unavailable (`computeCyclePosition` returns null for
 * < 30 bars / a dataless ticker), this contributes NO supplied block — the model
 * then honestly degrades rather than fabricating (the #468/#542 lesson).
 */

import { computeCyclePosition, type CycleInputs, type CyclePosition } from '../cycle'

/**
 * The computed technical fields fed into the analyser prompt. A structural subset
 * shared by the client `CycleDataResponse` (from `GET /cycle/ohlcv`) and the
 * engine's own `computeCyclePosition` output — so ONE formatter serves both call
 * sites.
 */
export interface SuppliedTechnicals {
  cyclePosition: number
  cycleStage: string
  rsiDivergence: string
  macdMomentum: string
  volumeTrend: string
  weekHigh52Pct: number
  signals: readonly { type: string; text: string }[]
  cycleSummary: string
}

/** Map a raw `computeCyclePosition` result to the supplied-technicals shape. */
export function suppliedTechnicalsFromCyclePosition(p: CyclePosition): SuppliedTechnicals {
  return {
    cyclePosition: p.score,
    cycleStage: p.stage,
    rsiDivergence: p.rsiDivergence,
    macdMomentum: p.macdMomentum,
    volumeTrend: p.volumeTrend,
    weekHigh52Pct: p.weekHigh52Pct,
    signals: p.signals,
    cycleSummary: p.summary,
  }
}

/**
 * Compute supplied technicals from raw OHLCV (server-side engine path). Returns
 * null when there is insufficient data (< 30 bars) — the caller then supplies
 * nothing and the model degrades honestly.
 */
export function suppliedTechnicalsFromOhlcv(ohlcv: CycleInputs | null): SuppliedTechnicals | null {
  const position = ohlcv ? computeCyclePosition(ohlcv) : null
  return position ? suppliedTechnicalsFromCyclePosition(position) : null
}

/**
 * Build the SUPPLIED-TECHNICAL block for a ticker's analyser prompt. Returns ''
 * when technicals are absent (null) — the caller injects nothing and the analysis
 * degrades honestly (never fabricates). The computed `signals[].text` already
 * carries the RSI/MACD/volume/52-week-high readings (e.g. "RSI at 90.7 —
 * significantly overbought"), so the model receives the concrete numbers.
 */
export function buildTickerSuppliedData(technicals: SuppliedTechnicals | null): string {
  if (!technicals) return ''

  const signalLines = technicals.signals.map((s) => s.text).join('; ')

  return (
    `\n\nSUPPLIED TECHNICAL DATA (real indicators COMPUTED from this ticker's OHLCV ` +
    `price history; these are computed, NOT searched — treat them as the authoritative ` +
    `source for the technical fields and base each technical field on THESE figures, not ` +
    `on searched or recalled numbers):\n` +
    `- Cycle position: ${technicals.cyclePosition} / 100 (stage: ${technicals.cycleStage})\n` +
    `- RSI divergence: ${technicals.rsiDivergence}\n` +
    `- MACD momentum: ${technicals.macdMomentum}\n` +
    `- Volume trend: ${technicals.volumeTrend}\n` +
    `- 52-week-high proximity: ${technicals.weekHigh52Pct}%\n` +
    (signalLines ? `- Computed signal readings: ${signalLines}\n` : '') +
    `- Cycle summary: ${technicals.cycleSummary}`
  )
}
