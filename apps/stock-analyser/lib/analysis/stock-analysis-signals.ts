export type StockSignalSentiment = 'Bull' | 'Bear' | 'Neutral'

export interface StockSignalMetric {
  name: string
  value: string
  signal: StockSignalSentiment
  label: string
}

type StockAnalysisForSignals = {
  verdict?: string | null
  cyclePosition?: number | null
  cycleStage?: string | null
  signals?: Array<{
    name?: unknown
    value?: unknown
    signal?: unknown
    label?: unknown
  }> | null
  rsiDivergence?: string | null
  macdMomentum?: string | null
  volumeTrend?: string | null
}

type SignalKey = 'trend' | 'rsi' | 'macd' | 'volume' | 'supportResistance' | 'relativeStrength'

const REQUIRED_SIGNAL_KEYS: SignalKey[] = [
  'trend',
  'rsi',
  'macd',
  'volume',
  'supportResistance',
  'relativeStrength',
]

const SIGNAL_NAMES: Record<SignalKey, string> = {
  trend: 'Trend',
  rsi: 'RSI',
  macd: 'MACD',
  volume: 'Volume',
  supportResistance: 'Support/Resistance',
  relativeStrength: 'Relative Strength',
}

const PLACEHOLDER_PATTERN =
  /\b(unavailable|not available|requires?\s+(?:live\s+)?(?:price|volume|chart|market|data)|not calculated|insufficient|unknown|unable to|cannot determine|no live data|no data|n\/a)\b/i

export const STOCK_ANALYSIS_SYSTEM_PROMPT =
  'You are a technical stock analyst. Provide realistic qualitative analysis with specific interpretations. Respond with raw JSON only. Do not use markdown code fences.'

export function createStockAnalysisPrompt(ticker: string): string {
  return `Analyse the stock ${ticker} and provide comprehensive technical analysis.

Return a JSON object with:
- ticker: the ticker symbol
- company: company name
- sector: sector classification
- price: current price (number)
- change: daily change percentage (number)
- verdict: one of "BUY", "SELL", "HOLD", "NEUTRAL"
- cyclePosition: 0-100 representing position in market cycle
- cycleStage: one of "early", "mid", "late", "peak"
- signals: exactly these six metrics, in this order, each with { name, value, signal: "Bull"|"Bear"|"Neutral", label }:
  1. Trend
  2. RSI
  3. MACD
  4. Volume
  5. Support/Resistance
  6. Relative Strength
  Provide qualitative fast-mode interpretations when live OHLCV is not available.
  Do not return "Unavailable", "Requires live data", "not calculated", "insufficient data", "unknown", or similar placeholder text.
  Examples: { name: "RSI", value: "Momentum leaning overbought", signal: "Bear", label: "Watch for exhaustion near the upper range" }
           { name: "Volume", value: "Accumulation profile improving", signal: "Bull", label: "Buying pressure appears supportive" }
- summary: 1-2 sentence company overview
- risks: array of 3 key risks as bullet points
- rsiDivergence: "none", "bullish", or "bearish"
- macdMomentum: "strengthening", "weakening", or "flat"
- volumeTrend: "confirming", "diverging", or "neutral"
- cycleSummary: brief cycle position explanation

Return ONLY valid JSON.`
}

export function normaliseStockAnalysisSignals<T extends StockAnalysisForSignals>(
  analysis: T,
): T & { signals: StockSignalMetric[] } {
  const existing = new Map<SignalKey, StockSignalMetric>()

  for (const signal of analysis.signals ?? []) {
    const key = signalKeyForName(signal.name)
    if (!key || existing.has(key)) continue

    const candidate = coerceSignalMetric(SIGNAL_NAMES[key], signal)
    if (!hasPlaceholderText(candidate)) {
      existing.set(key, candidate)
    }
  }

  return {
    ...analysis,
    signals: REQUIRED_SIGNAL_KEYS.map((key) => existing.get(key) ?? fallbackSignal(key, analysis)),
  }
}

function signalKeyForName(name?: unknown): SignalKey | null {
  const normalized = String(name ?? '').trim().toLowerCase()
  if (!normalized) return null
  if (normalized === 'trend' || normalized.includes('moving average')) return 'trend'
  if (normalized.includes('rsi')) return 'rsi'
  if (normalized.includes('macd')) return 'macd'
  if (normalized.includes('volume')) return 'volume'
  if (normalized.includes('support') || normalized.includes('resistance')) return 'supportResistance'
  if (normalized.includes('relative strength') || normalized === 'rs') return 'relativeStrength'
  return null
}

function coerceSignalMetric(
  name: string,
  signal: NonNullable<StockAnalysisForSignals['signals']>[number],
): StockSignalMetric {
  return {
    name,
    value: String(signal.value ?? '').trim(),
    signal: coerceSentiment(signal.signal),
    label: String(signal.label ?? '').trim(),
  }
}

function coerceSentiment(signal: unknown): StockSignalSentiment {
  return signal === 'Bull' || signal === 'Bear' || signal === 'Neutral' ? signal : 'Neutral'
}

function hasPlaceholderText(signal: StockSignalMetric): boolean {
  return PLACEHOLDER_PATTERN.test(`${signal.value} ${signal.label}`)
}

function fallbackSignal(key: SignalKey, analysis: StockAnalysisForSignals): StockSignalMetric {
  const cyclePosition = clampCyclePosition(analysis.cyclePosition)
  const verdict = (analysis.verdict ?? '').toUpperCase()

  switch (key) {
    case 'trend':
      return trendSignal(cyclePosition, verdict)
    case 'rsi':
      return rsiSignal(cyclePosition, analysis.rsiDivergence)
    case 'macd':
      return macdSignal(analysis.macdMomentum, verdict)
    case 'volume':
      return volumeSignal(analysis.volumeTrend)
    case 'supportResistance':
      return supportResistanceSignal(cyclePosition)
    case 'relativeStrength':
      return relativeStrengthSignal(verdict)
  }
}

function trendSignal(cyclePosition: number, verdict: string): StockSignalMetric {
  if (verdict === 'SELL') {
    return {
      name: SIGNAL_NAMES.trend,
      value: 'Trend risk skewing lower',
      signal: 'Bear',
      label: 'Price action suggests defensive positioning',
    }
  }

  if (cyclePosition >= 80) {
    return {
      name: SIGNAL_NAMES.trend,
      value: 'Uptrend extended near peak cycle',
      signal: 'Bear',
      label: 'Momentum may be vulnerable to reversal',
    }
  }

  if (cyclePosition >= 60) {
    return {
      name: SIGNAL_NAMES.trend,
      value: 'Long-term uptrend, but may be extended',
      signal: 'Bull',
      label: 'Primary trend remains positive',
    }
  }

  if (verdict === 'BUY' || cyclePosition < 35) {
    return {
      name: SIGNAL_NAMES.trend,
      value: 'Trend base improving',
      signal: 'Bull',
      label: 'Early-cycle setup supports accumulation',
    }
  }

  return {
    name: SIGNAL_NAMES.trend,
    value: 'Trend consolidating',
    signal: 'Neutral',
    label: 'Directional confirmation remains mixed',
  }
}

function rsiSignal(cyclePosition: number, rsiDivergence?: string | null): StockSignalMetric {
  if (rsiDivergence === 'bearish' || cyclePosition >= 75) {
    return {
      name: SIGNAL_NAMES.rsi,
      value: 'Momentum leaning overbought',
      signal: 'Bear',
      label: 'Watch for exhaustion near the upper range',
    }
  }

  if (rsiDivergence === 'bullish' || cyclePosition <= 35) {
    return {
      name: SIGNAL_NAMES.rsi,
      value: 'Momentum recovering from oversold',
      signal: 'Bull',
      label: 'Rebound conditions are improving',
    }
  }

  return {
    name: SIGNAL_NAMES.rsi,
    value: 'Momentum in a neutral range',
    signal: 'Neutral',
    label: 'No clear RSI divergence signal',
  }
}

function macdSignal(macdMomentum?: string | null, verdict?: string): StockSignalMetric {
  if (macdMomentum === 'strengthening' || verdict === 'BUY') {
    return {
      name: SIGNAL_NAMES.macd,
      value: 'Momentum signal strengthening',
      signal: 'Bull',
      label: 'Trend acceleration is improving',
    }
  }

  if (macdMomentum === 'weakening' || verdict === 'SELL') {
    return {
      name: SIGNAL_NAMES.macd,
      value: 'Momentum signal weakening',
      signal: 'Bear',
      label: 'Trend acceleration is fading',
    }
  }

  return {
    name: SIGNAL_NAMES.macd,
    value: 'Momentum broadly flat',
    signal: 'Neutral',
    label: 'No decisive acceleration signal',
  }
}

function volumeSignal(volumeTrend?: string | null): StockSignalMetric {
  if (volumeTrend === 'confirming') {
    return {
      name: SIGNAL_NAMES.volume,
      value: 'Volume confirming price move',
      signal: 'Bull',
      label: 'Participation supports the current trend',
    }
  }

  if (volumeTrend === 'diverging') {
    return {
      name: SIGNAL_NAMES.volume,
      value: 'Volume diverging from price',
      signal: 'Bear',
      label: 'Participation is not fully confirming the move',
    }
  }

  return {
    name: SIGNAL_NAMES.volume,
    value: 'Volume profile mixed',
    signal: 'Neutral',
    label: 'Participation is not giving a strong signal',
  }
}

function supportResistanceSignal(cyclePosition: number): StockSignalMetric {
  if (cyclePosition >= 80) {
    return {
      name: SIGNAL_NAMES.supportResistance,
      value: 'Testing upper resistance zone',
      signal: 'Bear',
      label: 'Risk/reward is less favourable near the upper range',
    }
  }

  if (cyclePosition >= 60) {
    return {
      name: SIGNAL_NAMES.supportResistance,
      value: 'Approaching resistance',
      signal: 'Neutral',
      label: 'Monitor for a breakout or rejection',
    }
  }

  if (cyclePosition <= 35) {
    return {
      name: SIGNAL_NAMES.supportResistance,
      value: 'Support base forming',
      signal: 'Bull',
      label: 'Lower-cycle setup offers more upside headroom',
    }
  }

  return {
    name: SIGNAL_NAMES.supportResistance,
    value: 'Trading within established range',
    signal: 'Neutral',
    label: 'Major levels remain balanced',
  }
}

function relativeStrengthSignal(verdict: string): StockSignalMetric {
  if (verdict === 'BUY') {
    return {
      name: SIGNAL_NAMES.relativeStrength,
      value: 'Relative strength improving',
      signal: 'Bull',
      label: 'Stock is positioned as a market leader',
    }
  }

  if (verdict === 'SELL') {
    return {
      name: SIGNAL_NAMES.relativeStrength,
      value: 'Relative strength deteriorating',
      signal: 'Bear',
      label: 'Stock is lagging better setups',
    }
  }

  return {
    name: SIGNAL_NAMES.relativeStrength,
    value: 'Relative strength broadly neutral',
    signal: 'Neutral',
    label: 'Performance is in line with the broader opportunity set',
  }
}

function clampCyclePosition(value?: number | null): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 50
  return Math.max(0, Math.min(100, value))
}
