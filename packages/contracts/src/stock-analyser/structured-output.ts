import type {
  CycleStage,
  MacdMomentum,
  RsiDivergence,
  VolumeTrend,
} from './types';
import type {
  MarketAnalysisResult,
  MacroIndicatorImpact,
  SectorSignalDirection,
  SectorValuation,
} from './market-analysis';
import {
  RECOMMENDATION_SIGNALS,
  type RecommendationModelOutput,
} from './recommendations';
import {
  ETF_CATEGORIES,
  ETF_SIGNALS,
  type EtfModelOutput,
} from './etfs';
import {
  METAL_SIGNALS,
  METAL_SYMBOLS,
  type MetalModelOutput,
} from './metals';

/**
 * Canonical Stock Analyser STRUCTURED-OUTPUT schemas (provider-agnostic).
 *
 * Why this file exists
 * --------------------
 * Stock Analyser AI surfaces were historically "prompt-and-parse": the provider
 * was asked for JSON inside prose and the runtime did
 * `JSON.parse(stripCodeFences(text))`. That is the root cause of malformed JSON
 * from stricter/looser model variants. This file defines the CANONICAL,
 * provider-agnostic structured-output schemas so the runtime can request real
 * structured output (provider `responseSchema`) instead of parsing prose. The
 * runtime MUST NOT invent these schemas locally.
 *
 * Authoring choice — DIRECT JSON Schema (not Zod)
 * ----------------------------------------------
 * The `contracts/` tree is intentionally DEPENDENCY-FREE pure TypeScript that is
 * consumed cross-repo by the runtime. Introducing a Zod runtime dependency (and,
 * for clean JSON Schema emission, the `zod/v4` subpath) into the canonical
 * contracts would couple every consumer to a specific Zod version. We therefore
 * export hand-authored canonical JSON Schema objects PLUS aligned TypeScript
 * types, with compile-time `satisfies` guards keeping the two in lockstep.
 *
 * Provider-safety rules (apply to every schema here)
 * -------------------------------------------------
 *  - Draft 2020-12.
 *  - `required` is listed EXPLICITLY for every non-optional property.
 *  - `additionalProperties: false` on every object.
 *  - Enums are spelled out explicitly (never free-form where a union exists).
 *  - No provider-specific schema extensions (no `x-*`, no OpenAI/xAI-only keys).
 *    Provider-specific shaping (e.g. OpenAI strict-mode quirks) is the runtime's
 *    job to apply on top of these canonical schemas — never baked in here.
 *
 * Nullable / optional behaviour
 * -----------------------------
 * These schemas describe the PROVIDER PAYLOAD — exactly what the model is asked
 * to return — and intentionally model only required fields. Client/runtime
 * ENRICHMENT fields that are added AFTER parsing (e.g. Market Analysis's
 * `recommendationUniverse` and `sourceRegion`, which are resolved from
 * `bestExchange` within the analysed region) are NOT part of the provider
 * payload and are deliberately absent from these schemas. The canonical result
 * TYPE (`MarketAnalysisResult`) carries those as optional; the provider SCHEMA
 * does not. See {@link MarketAnalysisProviderResult}.
 */

// ---------------------------------------------------------------------------
// Minimal provider-agnostic JSON Schema typing (Draft 2020-12 subset)
// ---------------------------------------------------------------------------

/**
 * A deliberately small JSON Schema shape covering only what these canonical
 * payload schemas need. It exists for authoring DX + compile-time checking, and
 * is NOT a general-purpose JSON Schema type. Provider-specific keywords are
 * intentionally not representable here.
 */
export interface JsonSchema {
  $schema?: string;
  $id?: string;
  title?: string;
  description?: string;
  type?: 'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean' | 'null';
  enum?: readonly string[];
  const?: string;
  properties?: Record<string, JsonSchema>;
  required?: readonly string[];
  additionalProperties?: boolean;
  items?: JsonSchema;
  minimum?: number;
  maximum?: number;
  minItems?: number;
  minLength?: number;
}

/** Draft used by every canonical schema in this file. */
export const STRUCTURED_OUTPUT_JSON_SCHEMA_DRAFT =
  'https://json-schema.org/draft/2020-12/schema' as const;

/**
 * Structured-output schema version. Bump on ANY breaking change to a schema
 * shape (removed/renamed required field, narrowed enum, changed type). Additive,
 * backwards-compatible changes (a new OPTIONAL field, a widened enum) do NOT
 * require a major bump. See migration notes at the bottom of this file.
 */
export type StockAnalyserStructuredOutputVersion = 'so.1.4.0';
export const stockAnalyserStructuredOutputVersion =
  'so.1.4.0' as const satisfies StockAnalyserStructuredOutputVersion;

// ---------------------------------------------------------------------------
// Shared enum tuples (single source for both the TS unions and the JSON enums)
// ---------------------------------------------------------------------------

const MACRO_IMPACTS = ['Supportive', 'Neutral', 'Headwind'] as const satisfies readonly MacroIndicatorImpact[];
const SECTOR_SIGNAL_DIRECTIONS = ['enter', 'HOLD', 'EXIT'] as const satisfies readonly SectorSignalDirection[];
const SECTOR_VALUATIONS = [
  'Cheap',
  'Attractive',
  'Fair',
  'Expensive',
  'Overvalued',
  'Extended',
] as const satisfies readonly SectorValuation[];

const CYCLE_STAGES = ['early', 'mid', 'late', 'peak'] as const satisfies readonly CycleStage[];
const RSI_DIVERGENCES = ['none', 'bullish', 'bearish'] as const satisfies readonly RsiDivergence[];
const MACD_MOMENTUMS = ['strengthening', 'weakening', 'flat'] as const satisfies readonly MacdMomentum[];
const VOLUME_TRENDS = ['confirming', 'diverging', 'neutral'] as const satisfies readonly VolumeTrend[];

// ===========================================================================
// 1) MARKET ANALYSIS — structured-output schema
// ===========================================================================

/**
 * The Market Analysis PROVIDER payload — the subset of `MarketAnalysisResult`
 * the model actually returns. It omits the client-enrichment fields
 * (`recommendationUniverse`, `sourceRegion`) that the app resolves AFTER parsing
 * a sector's `bestExchange`. Use this type for what crosses the provider
 * boundary; use `MarketAnalysisResult` for the enriched in-app value.
 */
export type MarketAnalysisProviderResult = Omit<MarketAnalysisResult, 'sectors'> & {
  sectors: Array<
    Omit<MarketAnalysisResult['sectors'][number], 'recommendationUniverse' | 'sourceRegion'>
  >;
};

/** Per-card source attribution sub-schema (#535 grain). */
const cardSourceSchema: JsonSchema = {
  type: 'object',
  description: 'Authoritative source the model based this card on (e.g. "RBA", "ASX", "EIA").',
  properties: {
    name: { type: 'string', minLength: 1 },
  },
  required: ['name'],
  additionalProperties: false,
};

/** Macro indicator sub-schema (one per macro card). */
const macroIndicatorSchema: JsonSchema = {
  type: 'object',
  properties: {
    label: { type: 'string', minLength: 1 },
    title: { type: 'string', minLength: 1 },
    description: { type: 'string', minLength: 1 },
    impact: { type: 'string', enum: MACRO_IMPACTS },
    source: cardSourceSchema,
  },
  required: ['label', 'title', 'description', 'impact', 'source'],
  additionalProperties: false,
};

/** Action item sub-schema (enter/exit conclusions). */
const actionItemSchema: JsonSchema = {
  type: 'object',
  properties: {
    sector: { type: 'string', minLength: 1 },
    reason: { type: 'string', minLength: 1 },
  },
  required: ['sector', 'reason'],
  additionalProperties: false,
};

/** Sector rotation signal sub-schema (provider payload — no client enrichment). */
const sectorSignalSchema: JsonSchema = {
  type: 'object',
  properties: {
    sector: { type: 'string', minLength: 1 },
    signal: { type: 'string', enum: SECTOR_SIGNAL_DIRECTIONS },
    cyclePosition: { type: 'number', minimum: 0, maximum: 100 },
    valuation: { type: 'string', enum: SECTOR_VALUATIONS },
    change: { type: 'number' },
    reason: { type: 'string', minLength: 1 },
    bestExchange: {
      type: 'string',
      minLength: 1,
      description:
        'Raw best-listing exchange string from the model (free text; may be unsupported). The app normalises this into a supported RecommendationUniverse after parsing.',
    },
    source: cardSourceSchema,
  },
  required: ['sector', 'signal', 'cyclePosition', 'valuation', 'change', 'reason', 'bestExchange', 'source'],
  additionalProperties: false,
};

/**
 * Canonical Market Analysis structured-output JSON Schema.
 *
 * `briefing` and `actionSummary` are synthesis/conclusions over everything and
 * are intentionally NOT individually sourced (no `source` field), matching the
 * #535 per-card attribution grain on macro indicators and sectors only.
 */
export const marketAnalysisResultJsonSchema = {
  $schema: STRUCTURED_OUTPUT_JSON_SCHEMA_DRAFT,
  $id: 'stock-analyser/market-analysis-result',
  title: 'MarketAnalysisResult',
  description:
    'Provider payload for the Market Analysis surface. Client-enrichment fields (recommendationUniverse, sourceRegion) are added after parsing and are intentionally not part of this schema.',
  type: 'object',
  properties: {
    macro: {
      type: 'object',
      properties: {
        cycleStage: macroIndicatorSchema,
        rateDirection: macroIndicatorSchema,
        keyRisk: macroIndicatorSchema,
        currency: macroIndicatorSchema,
      },
      required: ['cycleStage', 'rateDirection', 'keyRisk', 'currency'],
      additionalProperties: false,
    },
    briefing: { type: 'string', minLength: 1 },
    sectors: { type: 'array', items: sectorSignalSchema, minItems: 1 },
    actionSummary: {
      type: 'object',
      properties: {
        enter: { type: 'array', items: actionItemSchema },
        exit: { type: 'array', items: actionItemSchema },
      },
      required: ['enter', 'exit'],
      additionalProperties: false,
    },
  },
  required: ['macro', 'briefing', 'sectors', 'actionSummary'],
  additionalProperties: false,
} as const satisfies JsonSchema;

// ===========================================================================
// 2) PER-TICKER / STOCK ANALYSIS — promoted to canonical contract
// ===========================================================================

/**
 * Verdict union for a single stock analysis. Canonical contract mirror of the
 * UI `Verdict` type in `components/ui/design-system.tsx`; promoted here so the
 * per-ticker result stops being runtime/UI-only.
 */
export type StockVerdict = 'BUY' | 'HOLD' | 'SELL' | 'NEUTRAL';
const STOCK_VERDICTS = ['BUY', 'HOLD', 'SELL', 'NEUTRAL'] as const satisfies readonly StockVerdict[];

/** Direction of an individual technical signal row. */
export type StockSignalDirection = 'Bull' | 'Bear' | 'Neutral';
const STOCK_SIGNAL_DIRECTIONS = ['Bull', 'Bear', 'Neutral'] as const satisfies readonly StockSignalDirection[];

/**
 * A single technical-signal metric row in a per-ticker analysis.
 * Promoted from the tab-local `SignalMetric` in `analyser-tab.tsx`.
 */
export interface StockAnalysisSignal {
  name: string;
  /** Display value, kept as a string so qualitative reads ("Declining on advances") are valid. */
  value: string;
  signal: StockSignalDirection;
  label: string;
}

/**
 * Canonical per-ticker / stock analysis result.
 *
 * Promoted from the tab-local `AnalysisResult` in
 * `components/stock-analyser/tabs/analyser-tab.tsx`. The cycle sub-fields reuse
 * the canonical unions in `./types` so this stays in lockstep with
 * `CycleDataResponse`.
 */
/**
 * Data-completeness of an analysis (#603 — newly-listed / thin-data tickers).
 * ABSENT ⇒ `complete` (zero-migration). App-set (not AI-generated):
 *  - `complete` — full analysis with price + grounded technicals.
 *  - `no-price` — analysis grounded, but no live OHLCV/price was available (e.g.
 *    Yahoo 404/503 for a newly-listed ticker); price/change/cycle read as absent.
 *  - `insufficient-data` — the Live grounding found no verifiable market data
 *    (the #601 `security` guard fired). The analysis is NOT fabricated: a
 *    distinguished honest result is returned instead of a 502. Verdict is
 *    `NEUTRAL` (no signal); notifications treat it as no-signal.
 */
export type StockAnalysisDataStatus = 'complete' | 'no-price' | 'insufficient-data';

export interface StockAnalysisResult {
  ticker: string;
  company: string;
  sector: string;
  price: number;
  change: number;
  verdict: StockVerdict;
  /** 0–100 position within the cycle. */
  cyclePosition: number;
  cycleStage: CycleStage;
  signals: StockAnalysisSignal[];
  summary: string;
  risks: string[];
  rsiDivergence: RsiDivergence;
  macdMomentum: MacdMomentum;
  volumeTrend: VolumeTrend;
  cycleSummary: string;
  /**
   * #603 data-completeness. OPTIONAL, absent ⇒ `complete`. Set by the app (never
   * by the AI) for newly-listed / thin-data tickers so the tab renders an honest
   * degraded state instead of erroring, and warm/notifications treat it correctly.
   */
  dataStatus?: StockAnalysisDataStatus;
}

/** True when an analysis is degraded (#603) — no price, or insufficient data. */
export function isDegradedAnalysis(result: Pick<StockAnalysisResult, 'dataStatus'>): boolean {
  return result.dataStatus === 'no-price' || result.dataStatus === 'insufficient-data';
}

/**
 * The distinguished honest result for a ticker whose Live grounding found no
 * verifiable market data (#603 / #601 `security` guard) — returned INSTEAD of a
 * 502 so the analysis "distinguishes cleanly". Not fabricated: neutral verdict,
 * empty signals, an explicit `insufficient-data` status and summary. The tab
 * renders "insufficient data — newly listed?"; notifications see NEUTRAL ⇒ no send.
 */
export function insufficientDataAnalysis(ticker: string, company?: string): StockAnalysisResult {
  return {
    ticker,
    company: company ?? ticker,
    sector: 'Unknown',
    price: 0,
    change: 0,
    verdict: 'NEUTRAL',
    cyclePosition: 50,
    cycleStage: 'mid',
    signals: [],
    summary:
      'Insufficient data for analysis — this ticker appears newly listed or has no verifiable ' +
      'market data yet. Grounded research could not confirm price/technical context.',
    risks: [],
    rsiDivergence: 'none',
    macdMomentum: 'flat',
    volumeTrend: 'neutral',
    cycleSummary: 'Insufficient data — newly listed or unverifiable.',
    dataStatus: 'insufficient-data',
  };
}

const stockAnalysisSignalSchema: JsonSchema = {
  type: 'object',
  properties: {
    name: { type: 'string', minLength: 1 },
    value: { type: 'string' },
    signal: { type: 'string', enum: STOCK_SIGNAL_DIRECTIONS },
    label: { type: 'string' },
  },
  required: ['name', 'value', 'signal', 'label'],
  additionalProperties: false,
};

/** Canonical per-ticker / stock analysis structured-output JSON Schema. */
export const stockAnalysisResultJsonSchema = {
  $schema: STRUCTURED_OUTPUT_JSON_SCHEMA_DRAFT,
  $id: 'stock-analyser/stock-analysis-result',
  title: 'StockAnalysisResult',
  description: 'Provider payload for a single-ticker technical analysis.',
  type: 'object',
  properties: {
    ticker: { type: 'string', minLength: 1 },
    company: { type: 'string', minLength: 1 },
    sector: { type: 'string', minLength: 1 },
    price: { type: 'number' },
    change: { type: 'number' },
    verdict: { type: 'string', enum: STOCK_VERDICTS },
    cyclePosition: { type: 'number', minimum: 0, maximum: 100 },
    cycleStage: { type: 'string', enum: CYCLE_STAGES },
    signals: { type: 'array', items: stockAnalysisSignalSchema, minItems: 1 },
    summary: { type: 'string', minLength: 1 },
    risks: { type: 'array', items: { type: 'string', minLength: 1 } },
    rsiDivergence: { type: 'string', enum: RSI_DIVERGENCES },
    macdMomentum: { type: 'string', enum: MACD_MOMENTUMS },
    volumeTrend: { type: 'string', enum: VOLUME_TRENDS },
    cycleSummary: { type: 'string', minLength: 1 },
    // #603 OPTIONAL app-set data-completeness (absent ⇒ complete). Not required —
    // the AI never sets it; the app annotates degraded/newly-listed results.
    dataStatus: { type: 'string', enum: ['complete', 'no-price', 'insufficient-data'] },
  },
  required: [
    'ticker',
    'company',
    'sector',
    'price',
    'change',
    'verdict',
    'cyclePosition',
    'cycleStage',
    'signals',
    'summary',
    'risks',
    'rsiDivergence',
    'macdMomentum',
    'volumeTrend',
    'cycleSummary',
  ],
  additionalProperties: false,
} as const satisfies JsonSchema;

// ===========================================================================
// 3) RECOMMENDATIONS — structured-output schema (#592, now DEFINED)
// ===========================================================================

/**
 * Single ranked-candidate item the model authors. Mirrors
 * {@link RecommendationModelOutput} from `./recommendations`. Note the absence
 * of `price`/`change`: those are REAL OHLCV market data (#468) supplied to the
 * model as input and overlaid for display by the engine — never model-authored
 * (the pricing-before-verdict fix). The dropped fields
 * (`cyclePosition`/`cycleStage`/`conviction`) are likewise intentionally absent.
 */
const recommendationItemSchema: JsonSchema = {
  type: 'object',
  properties: {
    ticker: { type: 'string', minLength: 1 },
    company: { type: 'string', minLength: 1 },
    sector: { type: 'string', minLength: 1 },
    subcategory: { type: 'string', minLength: 1 },
    recommendationSignal: { type: 'string', enum: RECOMMENDATION_SIGNALS },
    analysis: { type: 'string', minLength: 1 },
  },
  required: ['ticker', 'company', 'sector', 'subcategory', 'recommendationSignal', 'analysis'],
  additionalProperties: false,
};

/**
 * Canonical Recommendations structured-output JSON Schema (#592).
 *
 * Models the MODEL OUTPUT only — the ranked shortlist. The engine overlays real
 * `price`/`change` (OHLCV, #468) AFTER parsing to produce the rendered
 * `Recommendation`; those enrichment fields are deliberately not in this schema
 * (same provider-payload-vs-enriched split as Market Analysis).
 */
export const recommendationsResultJsonSchema = {
  $schema: STRUCTURED_OUTPUT_JSON_SCHEMA_DRAFT,
  $id: 'stock-analyser/recommendations-result',
  title: 'RecommendationsResult',
  description:
    'Provider payload for the Recommendations surface: the ranked shortlist the model authors. Real price/change (OHLCV overlay) are added by the engine after parsing and are intentionally not part of this schema.',
  type: 'object',
  properties: {
    recommendations: { type: 'array', items: recommendationItemSchema, minItems: 1 },
  },
  required: ['recommendations'],
  additionalProperties: false,
} as const satisfies JsonSchema;

/**
 * Recommendations structured output is now DEFINED (#592) — see
 * {@link recommendationsResultJsonSchema} and
 * `contracts/stock-analyser/recommendations.ts`. Previously deferred; retained
 * for any consumer that branched on the deferral and now reflects the defined
 * state. The runtime `runRecommendations` engine is built against this schema.
 */
export const RECOMMENDATIONS_STRUCTURED_OUTPUT_STATUS = 'defined' as const;

// ===========================================================================
// 4) ETFS — structured-output schema (#626, now DEFINED)
// ===========================================================================

/**
 * Single ETF item the model authors. Mirrors {@link EtfModelOutput} from
 * `./etfs`. As with Recommendations, `price`/`change` are absent — they are REAL
 * OHLCV market data (#468) supplied to the model as input and overlaid for
 * display by the `runEtfs` engine, never model-authored. `expenseRatio` is a
 * model-authored fund attribute (see `etfs.behaviour.md`). ETFs reuse the
 * Recommendations `pick|watch|avoid` vocabulary.
 */
const etfItemSchema: JsonSchema = {
  type: 'object',
  properties: {
    ticker: { type: 'string', minLength: 1 },
    name: { type: 'string', minLength: 1 },
    category: { type: 'string', enum: ETF_CATEGORIES },
    expenseRatio: { type: 'number', minimum: 0 },
    recommendationSignal: { type: 'string', enum: ETF_SIGNALS },
    analysis: { type: 'string', minLength: 1 },
  },
  required: ['ticker', 'name', 'category', 'expenseRatio', 'recommendationSignal', 'analysis'],
  additionalProperties: false,
};

/**
 * Canonical ETFs structured-output JSON Schema (#626).
 *
 * Models the MODEL OUTPUT only — the ranked ETF shortlist. The engine overlays
 * real `price`/`change` (OHLCV, #468) AFTER parsing to produce the rendered
 * `Etf`; those enrichment fields are deliberately not in this schema (same
 * provider-payload-vs-enriched split as Market Analysis and Recommendations).
 */
export const etfsResultJsonSchema = {
  $schema: STRUCTURED_OUTPUT_JSON_SCHEMA_DRAFT,
  $id: 'stock-analyser/etfs-result',
  title: 'EtfsResult',
  description:
    'Provider payload for the ETFs surface: the ranked ETF shortlist the model authors. Real price/change (OHLCV overlay) are added by the engine after parsing and are intentionally not part of this schema.',
  type: 'object',
  properties: {
    etfs: { type: 'array', items: etfItemSchema, minItems: 1 },
  },
  required: ['etfs'],
  additionalProperties: false,
} as const satisfies JsonSchema;

// ===========================================================================
// 5) METALS — structured-output schema (#627, now DEFINED)
// ===========================================================================

/**
 * Single metal item the model authors. Mirrors {@link MetalModelOutput} from
 * `./metals`. The model authors ONLY `signal` + `outlook`, keyed to the metal by
 * `symbol`. All price data (USD + AUD spot, today/YTD/30-day change) is REAL feed
 * data from the metals feed (metals.dev + stored close history), supplied to the
 * model as input and overlaid for display by the `runMetals` engine — never
 * model-authored. Metals keep the BULL/NEUTRAL/BEAR trend vocabulary rather than
 * pick/watch/avoid.
 */
const metalItemSchema: JsonSchema = {
  type: 'object',
  properties: {
    symbol: { type: 'string', enum: METAL_SYMBOLS },
    signal: { type: 'string', enum: METAL_SIGNALS },
    outlook: { type: 'string', minLength: 1 },
  },
  required: ['symbol', 'signal', 'outlook'],
  additionalProperties: false,
};

/**
 * Canonical Metals structured-output JSON Schema (#627).
 *
 * Models the MODEL OUTPUT only — per-metal signal + outlook. The engine overlays
 * real feed data (USD/AUD spot, today/YTD/30-day change from metals.dev + stored
 * closes) AFTER parsing to produce the rendered `Metal`; those feed fields are
 * deliberately not in this schema (same feed-vs-model split as the OHLCV overlay
 * on Market/Recs/ETFs).
 */
export const metalsResultJsonSchema = {
  $schema: STRUCTURED_OUTPUT_JSON_SCHEMA_DRAFT,
  $id: 'stock-analyser/metals-result',
  title: 'MetalsResult',
  description:
    'Provider payload for the Metals surface: per-metal signal + outlook the model authors. Real USD/AUD spot and today/YTD/30-day change (metals feed + stored closes) are added by the engine after parsing and are intentionally not part of this schema.',
  type: 'object',
  properties: {
    metals: { type: 'array', items: metalItemSchema, minItems: 1 },
  },
  required: ['metals'],
  additionalProperties: false,
} as const satisfies JsonSchema;

// ---------------------------------------------------------------------------
// Schema registry (provider-agnostic lookup for runtime wiring)
// ---------------------------------------------------------------------------

/** Surfaces that have a canonical structured-output schema TODAY. */
export type StructuredOutputSurface = 'market' | 'analyser' | 'recs' | 'etfs' | 'metals';

/** Canonical schema registry, keyed by surface. */
export const stockAnalyserStructuredOutputSchemas = {
  market: marketAnalysisResultJsonSchema,
  analyser: stockAnalysisResultJsonSchema,
  recs: recommendationsResultJsonSchema,
  etfs: etfsResultJsonSchema,
  metals: metalsResultJsonSchema,
} as const satisfies Record<StructuredOutputSurface, JsonSchema>;

// ---------------------------------------------------------------------------
// Examples (compile-time guards that schema and TS type stay aligned)
// ---------------------------------------------------------------------------

/** Provider payload example for Market Analysis (pre-enrichment). */
export const exampleMarketAnalysisProviderResult = {
  macro: {
    cycleStage: {
      label: 'CYCLE STAGE',
      title: 'Late Cycle Expansion',
      description: 'Economy at capacity constraints with strong growth but rising inflation.',
      impact: 'Neutral',
      source: { name: 'ABS' },
    },
    rateDirection: {
      label: 'RATE DIRECTION',
      title: 'Tightening',
      description: 'RBA hiked to 4.35% amid stagflation risks; further hikes likely.',
      impact: 'Headwind',
      source: { name: 'RBA' },
    },
    keyRisk: {
      label: 'KEY RISK',
      title: 'Middle East Conflict Stagflation',
      description: 'Oil at $93–105; inflation expectations rising.',
      impact: 'Headwind',
      source: { name: 'EIA' },
    },
    currency: {
      label: 'USD / CURRENCY',
      title: 'Strong',
      description: 'USD index firmer on safe-haven flows.',
      impact: 'Supportive',
      source: { name: 'ICE' },
    },
  },
  briefing:
    'The ASX faces a challenging macro backdrop as the RBA tightens amid stagflation risks.',
  sectors: [
    {
      sector: 'Energy',
      signal: 'enter',
      cyclePosition: 85,
      valuation: 'Cheap',
      change: -19,
      reason: 'Direct beneficiary of the oil crisis with strong free cash flows.',
      bestExchange: 'NYSE',
      source: { name: 'EIA' },
    },
  ],
  actionSummary: {
    enter: [{ sector: 'Energy', reason: 'Strong pricing power through the oil crisis.' }],
    exit: [{ sector: 'Technology', reason: 'Extreme valuations vulnerable to rising rates.' }],
  },
} as const satisfies MarketAnalysisProviderResult;

/** Per-ticker analysis example. */
export const exampleStockAnalysisResult = {
  ticker: 'BHP.AX',
  company: 'BHP Group Limited',
  sector: 'Materials',
  price: 41.2,
  change: -1.8,
  verdict: 'HOLD',
  cyclePosition: 72,
  cycleStage: 'late',
  signals: [
    { name: 'RSI', value: '68', signal: 'Bear', label: 'Approaching overbought' },
    { name: 'Volume', value: 'Declining on advances', signal: 'Bear', label: 'Bearish divergence' },
  ],
  summary: 'Diversified miner with strong iron ore exposure facing softening Chinese demand.',
  risks: ['China demand slowdown', 'Commodity price volatility', 'Regulatory/ESG headwinds'],
  rsiDivergence: 'bearish',
  macdMomentum: 'weakening',
  volumeTrend: 'diverging',
  cycleSummary: 'Late-cycle positioning with momentum cooling from recent highs.',
} as const satisfies StockAnalysisResult;

/** Recommendations model-output example (provider payload — no price/change). */
export const exampleRecommendationsResult = {
  recommendations: [
    {
      ticker: 'WDS.AX',
      company: 'Woodside Energy Group Limited',
      sector: 'Energy',
      subcategory: 'Oil & Gas',
      recommendationSignal: 'pick',
      analysis:
        'Direct beneficiary of elevated energy prices with strong free cash flow and a covered dividend at the supplied price; Scarborough LNG nearing first cargo adds growth at an attractive relative valuation.',
    },
  ],
} as const satisfies { recommendations: RecommendationModelOutput[] };

/** ETFs model-output example (provider payload — no price/change). */
export const exampleEtfsResult = {
  etfs: [
    {
      ticker: 'VAS.AX',
      name: 'Vanguard Australian Shares Index ETF',
      category: 'Index',
      expenseRatio: 0.1,
      recommendationSignal: 'pick',
      analysis:
        'Core Australian equity exposure tracking the S&P/ASX 300 across 300+ holdings, with an ultra-low 0.10% MER making it cost-effective for long-term core allocation at the supplied price.',
    },
  ],
} as const satisfies { etfs: EtfModelOutput[] };

/** Metals model-output example (provider payload — signal + outlook only). */
export const exampleMetalsResult = {
  metals: [
    {
      symbol: 'XAU/USD',
      signal: 'NEUTRAL',
      outlook:
        'At the supplied spot, gold consolidates as safe-haven demand is offset by firm real yields; the muted today/30-day move against a solid YTD gain supports a balanced stance.',
    },
  ],
} as const satisfies { metals: MetalModelOutput[] };

/*
 * ---------------------------------------------------------------------------
 * Schema versioning & migration expectations
 * ---------------------------------------------------------------------------
 * - `stockAnalyserStructuredOutputVersion` is the single version for ALL
 *   schemas in this file (they ship and evolve together).
 * - MAJOR bump (e.g. so.2.0.0): any breaking change — removing/renaming a
 *   required field, narrowing an enum, or changing a field's type. Runtime must
 *   gate on the version before sending the schema to a provider.
 * - MINOR bump (e.g. so.1.1.0): backwards-compatible additions — a new OPTIONAL
 *   field, or a WIDENED enum. Existing valid payloads remain valid.
 * - PATCH bump (e.g. so.1.0.1): description/annotation-only edits with no shape
 *   impact.
 * - Migration: when a MAJOR change lands, update this package, run
 *   `pnpm check:contracts`, and update provider `responseSchema` wiring in the
 *   SAME change set. Tolerant parse/retry (see the behaviour doc) is the
 *   fallback during rollout, never the primary path.
 */
