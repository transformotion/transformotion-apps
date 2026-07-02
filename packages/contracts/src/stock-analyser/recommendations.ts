/**
 * Canonical Recommendations contract (#592) — DEFINED HERE FOR THE FIRST TIME.
 *
 * Background
 * ----------
 * Recommendations was historically a client-side, free-text, schema-less AI call
 * living entirely in `recommendations-tab.tsx` (the app-local `Stock` interface).
 * It had a confirmed *pricing-before-verdict* bug: the model formed each verdict
 * against a hallucinated price, and the real OHLCV price was overlaid only AFTER,
 * for display — so the verdict never actually saw the real price.
 *
 * #592 re-architects Recommendations as a backend engine (`runRecommendations`)
 * with a TWO-STAGE flow:
 *   1. fetch the REAL market price (OHLCV overlay, #468) for each candidate;
 *   2. SUPPLY that real price to the model, which then ranks WITH it.
 *
 * This file is the CONTRACT only — the request/response shape and the new
 * `recommendationSignal` vocabulary. Building the engine is the runtime's job,
 * against this contract. The structured-output JSON Schema for the model's
 * payload lives in `./structured-output` (registry surface `recs`) and is built
 * from {@link RecommendationModelOutput} here.
 *
 * Authoring note (dependency-free): like the rest of `contracts/`, this file is
 * pure TypeScript types + `satisfies` example guards. No runtime dependencies.
 */

import type { SearchMode } from './cache-freshness';
import type { RecommendationUniverse } from './types';

// ===========================================================================
// 1) VOCABULARY (#593) — recommendationSignal: pick | watch | avoid
// ===========================================================================

/**
 * Recommendations verdict vocabulary — deliberately the THIRD, distinct
 * vocabulary in the Stock Analyser, separate from the other two:
 *
 *  - Market Analysis  → `sectorAction`:     enter | maintain | exit
 *    (sector ALLOCATION judgment)
 *  - Recommendations  → `recommendationSignal`: pick | watch | avoid   ← THIS
 *    (SHORTLIST candidacy judgment)
 *  - Single Analyser  → `technicalVerdict`:  BUY | HOLD | SELL | NEUTRAL
 *    (single-stock TECHNICAL judgment)
 *
 * Why a separate vocabulary: a Recommendations signal answers "is this a
 * shortlist candidate?", NOT "what is this stock's technical verdict?". Keeping
 * the language distinct lets BHP be a Recommendations `Pick` while the single
 * Analyser independently reads `HOLD` without the two looking contradictory.
 */
export type RecommendationSignal = 'pick' | 'watch' | 'avoid';

export const RECOMMENDATION_SIGNALS = [
  'pick',
  'watch',
  'avoid',
] as const satisfies readonly RecommendationSignal[];

/** Human-facing badge labels for each signal. */
export const RECOMMENDATION_SIGNAL_LABELS: Record<RecommendationSignal, string> = {
  pick: 'Pick',
  watch: 'Watch',
  avoid: 'Avoid',
};

/**
 * Semantic tone for each signal, so the badge surface reads consistently with
 * the other verdict-badge families (positive / neutral / caution):
 *  - pick  → positive (a shortlist candidate)
 *  - watch → neutral  (on the radar, not yet a candidate)
 *  - avoid → caution  (explicitly not a candidate now)
 */
export type RecommendationSignalTone = 'positive' | 'neutral' | 'caution';

export const RECOMMENDATION_SIGNAL_TONES: Record<RecommendationSignal, RecommendationSignalTone> = {
  pick: 'positive',
  watch: 'neutral',
  avoid: 'caution',
};

export function isRecommendationSignal(value: unknown): value is RecommendationSignal {
  return typeof value === 'string' && (RECOMMENDATION_SIGNALS as readonly string[]).includes(value);
}

// ===========================================================================
// 2) MODE — which kind of shortlist the engine produces
// ===========================================================================

/**
 * The Recommendations shortlist mode. Canonical (kebab) values for the engine;
 * {@link RECOMMENDATION_MODE_LABELS} provides the display strings the tab shows.
 */
export type RecommendationMode = 'top-picks' | 'bottom-of-cycle';

export const RECOMMENDATION_MODES = [
  'top-picks',
  'bottom-of-cycle',
] as const satisfies readonly RecommendationMode[];

export const RECOMMENDATION_MODE_LABELS: Record<RecommendationMode, string> = {
  'top-picks': 'Top Picks',
  'bottom-of-cycle': 'Bottom of Cycle',
};

export function isRecommendationMode(value: unknown): value is RecommendationMode {
  return typeof value === 'string' && (RECOMMENDATION_MODES as readonly string[]).includes(value);
}

// ===========================================================================
// 3) REQUEST — what runRecommendations takes
// ===========================================================================

/**
 * Input to the `runRecommendations` engine.
 *
 * `universe` is an exchange/listing/index (NOT a geography — see
 * `RecommendationUniverse` vs `AnalysisRegion` in `./types`). `sector` is the
 * optional filter present when the user arrived from a Market Analysis sector
 * card. `searchMode` is the Fast/Live toggle (`'fast'` = model/training data,
 * no web call; `'live'` = live web search).
 */
export interface RunRecommendationsRequest {
  universe: RecommendationUniverse;
  mode: RecommendationMode;
  /** Optional sector filter (e.g. when navigated from a Market Analysis sector card). */
  sector?: string;
  searchMode: SearchMode;
}

// ===========================================================================
// 4) RESPONSE — the per-candidate shape
// ===========================================================================

/**
 * The MODEL OUTPUT for a single candidate — the provider payload the structured
 * schema validates. This is what the AI authors; it deliberately does NOT carry
 * `price`/`change`. Price is REAL market data from the OHLCV overlay (#468),
 * supplied to the model as INPUT (stage 1) and overlaid for display (stage 2) —
 * never authored by the model. This is the structural fix for the
 * pricing-before-verdict bug.
 *
 * Dropped vs. the old client-side `Stock` shape (generated but NEVER rendered,
 * costing output tokens for nothing): `cyclePosition`, `cycleStage`,
 * `conviction`. They are intentionally absent. If a future redesign decides to
 * SHOW per-candidate technicals, that is a NEW decision that re-introduces the
 * grounding requirement (out of scope here) — do not pre-build for it.
 */
export interface RecommendationModelOutput {
  ticker: string;
  company: string;
  sector: string;
  /** Sub-classification within the sector, e.g. "Oil & Gas" (rendered on the card). */
  subcategory: string;
  recommendationSignal: RecommendationSignal;
  /**
   * Qualitative thesis prose. MUST reason on GROUNDED facts (the supplied real
   * price, fundamentals, sector fit, relative value) and MUST NOT assert precise
   * unverified technicals (specific MA positions, RSI values) it has not
   * grounded. See `recommendations.behaviour.md`.
   */
  analysis: string;
}

/**
 * A finished recommendation as rendered by the thin-UI tab: the model output
 * plus the REAL market price/change overlaid from OHLCV (#468). `price`/`change`
 * are authoritative market data, not model output.
 */
export interface Recommendation extends RecommendationModelOutput {
  /** Real current price from the OHLCV overlay (#468), not model-authored. */
  price: number;
  /** Real daily change percentage from the OHLCV overlay (#468), not model-authored. */
  change: number;
}

/** Output of the `runRecommendations` engine: the finished, price-overlaid shortlist. */
export interface RunRecommendationsResponse {
  recommendations: Recommendation[];
  /** ISO timestamp the shortlist was produced (provenance/freshness). */
  generatedAt: string;
}

// ===========================================================================
// Examples (compile-time guards keeping types and intent aligned)
// ===========================================================================

/** Model-output example (provider payload — no price/change). */
export const exampleRecommendationModelOutput = {
  ticker: 'WDS.AX',
  company: 'Woodside Energy Group Limited',
  sector: 'Energy',
  subcategory: 'Oil & Gas',
  recommendationSignal: 'pick',
  analysis:
    'Direct beneficiary of elevated energy prices with strong free cash flow and a covered dividend at the supplied price. Scarborough LNG nearing first cargo adds growth on top of an attractive relative valuation versus global peers.',
} as const satisfies RecommendationModelOutput;

/** Enriched recommendation example (price/change overlaid from OHLCV). */
export const exampleRecommendation = {
  ...exampleRecommendationModelOutput,
  price: 33.85,
  change: 2.2,
} as const satisfies Recommendation;

/** Request example. */
export const exampleRunRecommendationsRequest = {
  universe: 'ASX',
  mode: 'top-picks',
  searchMode: 'live',
} as const satisfies RunRecommendationsRequest;

/** Response example. */
export const exampleRunRecommendationsResponse = {
  recommendations: [exampleRecommendation],
  generatedAt: '2026-06-07T00:00:00.000Z',
} as const satisfies RunRecommendationsResponse;
