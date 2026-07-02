/**
 * Canonical ETFs contract (#626) — DEFINED HERE FOR THE FIRST TIME.
 *
 * Background
 * ----------
 * ETFs was historically a client-side, free-text, schema-less AI call living
 * entirely in `etfs-tab.tsx` (the app-local `ETF` interface). Like the old
 * Recommendations surface (#592), it had the *pricing-before-verdict* shape: the
 * model authored a `signal` and a `price` in the same free-text payload, so the
 * signal was formed against a hallucinated price rather than real market data.
 *
 * #626 re-architects ETFs as a backend engine (`runEtfs`), mirroring #592's
 * two-stage flow:
 *   1. fetch the REAL market price (OHLCV overlay, #468) for each candidate ETF;
 *   2. SUPPLY that real price to the model, which then ranks WITH it.
 *
 * This file is the CONTRACT only — the request/response shape. Building the
 * engine is the runtime's job, against this contract. The structured-output JSON
 * Schema for the model's payload lives in `./structured-output` (registry
 * surface `etfs`) and is built from {@link EtfModelOutput} here.
 *
 * Vocabulary reuse
 * ----------------
 * ETFs are a SHORTLIST, exactly like Recommendations — so they reuse the SAME
 * `recommendationSignal` vocabulary (`pick | watch | avoid`), enum, labels, and
 * badge family from `./recommendations`. They deliberately do NOT get a fourth
 * vocabulary. See `etfs.behaviour.md`.
 *
 * No mode dimension
 * -----------------
 * Unlike Recommendations (whose scope is `universe | mode | sector`), ETFs are
 * purely MARKET-keyed (ASX / US / Global). There is no Top-Picks/Bottom-of-Cycle
 * mode and no sector filter.
 *
 * Authoring note (dependency-free): like the rest of `contracts/`, this file is
 * pure TypeScript types + `satisfies` example guards. No runtime dependencies.
 */

import type { SearchMode } from './cache-freshness';
import {
  RECOMMENDATION_SIGNALS,
  RECOMMENDATION_SIGNAL_LABELS,
  isRecommendationSignal,
  type RecommendationSignal,
} from './recommendations';

// ===========================================================================
// 1) VOCABULARY — reuse recommendationSignal (pick | watch | avoid)
// ===========================================================================

/**
 * ETFs reuse the Recommendations shortlist vocabulary verbatim — an ETF `Pick`
 * is a shortlist candidate exactly as a stock `Pick` is. Re-exported here so ETF
 * consumers have a single import site without reaching into `./recommendations`,
 * while the values remain one canonical source (no divergence possible).
 */
export type EtfSignal = RecommendationSignal;
export const ETF_SIGNALS = RECOMMENDATION_SIGNALS;
export const ETF_SIGNAL_LABELS = RECOMMENDATION_SIGNAL_LABELS;
export const isEtfSignal = isRecommendationSignal;

// ===========================================================================
// 2) MARKET — the only scoping dimension for ETFs
// ===========================================================================

/**
 * The ETF market. This is a broad listing scope (ASX / US / Global), NOT the
 * `RecommendationUniverse` (ASX / NASDAQ / Dow / FTSE) and NOT an
 * `AnalysisRegion` geography. ETFs are keyed solely by this value.
 */
export type EtfMarket = 'ASX' | 'US' | 'Global';

export const ETF_MARKETS = ['ASX', 'US', 'Global'] as const satisfies readonly EtfMarket[];

/** Display labels (identity today; kept as a table so the tab never hard-codes). */
export const ETF_MARKET_LABELS: Record<EtfMarket, string> = {
  ASX: 'ASX',
  US: 'US',
  Global: 'Global',
};

export function isEtfMarket(value: unknown): value is EtfMarket {
  return typeof value === 'string' && (ETF_MARKETS as readonly string[]).includes(value);
}

// ===========================================================================
// 3) CATEGORY — ETF classification
// ===========================================================================

/**
 * Per-ETF classification. Note this is the set of REAL categories an ETF can
 * belong to — it deliberately excludes the old tab-local `"All"` value, which
 * was a FILTER concept, never a real per-ETF category. If a category filter UI
 * is added later, model `"All"`/`undefined` at the filter layer, not here.
 */
export type EtfCategory = 'Index' | 'Sector' | 'Bond' | 'Thematic' | 'Property';

export const ETF_CATEGORIES = [
  'Index',
  'Sector',
  'Bond',
  'Thematic',
  'Property',
] as const satisfies readonly EtfCategory[];

export function isEtfCategory(value: unknown): value is EtfCategory {
  return typeof value === 'string' && (ETF_CATEGORIES as readonly string[]).includes(value);
}

// ===========================================================================
// 4) REQUEST — what runEtfs takes
// ===========================================================================

/**
 * Input to the `runEtfs` engine. `market` is the sole scoping dimension;
 * `searchMode` is the Fast/Live toggle (`'fast'` = model/training data, no web
 * call; `'live'` = live web search).
 */
export interface RunEtfsRequest {
  market: EtfMarket;
  searchMode: SearchMode;
}

// ===========================================================================
// 5) RESPONSE — the per-ETF shape
// ===========================================================================

/**
 * The MODEL OUTPUT for a single ETF — the provider payload the structured schema
 * validates. This is what the AI authors; it deliberately does NOT carry
 * `price`/`change`. Price is REAL market data from the OHLCV overlay (#468),
 * supplied to the model as INPUT (stage 1) and overlaid for display (stage 2) —
 * never authored by the model. This is the structural fix for the
 * pricing-before-signal shape.
 *
 * Dropped vs. the old client-side `ETF` shape: the model-authored `price`/
 * `change` (now the real OHLCV overlay) and the old design-system `signal`
 * (replaced by `recommendationSignal`). Mirrors how #592 dropped Recs' vestigial
 * fields.
 *
 * `expenseRatio` remains a model-authored fund attribute (it is a stable fund
 * fact the shortlist reasons on, alongside category/yield — see item 4 of the
 * task and `etfs.behaviour.md`). If a future data source provides authoritative
 * fund metadata, `expenseRatio` can move to the overlay the same way price did;
 * that is out of scope for #626.
 */
export interface EtfModelOutput {
  ticker: string;
  name: string;
  category: EtfCategory;
  /** Expense ratio as a decimal (e.g. 0.10 == 0.10% MER). Model-authored fund attribute. */
  expenseRatio: number;
  recommendationSignal: EtfSignal;
  /**
   * Qualitative thesis prose. MUST reason on GROUNDED facts (the supplied real
   * price, fees/expense ratio, category, yield, asset size) and MUST NOT assert
   * precise unverified technicals (specific MA positions, RSI values) it has not
   * grounded. See `etfs.behaviour.md`.
   */
  analysis: string;
}

/**
 * A finished ETF as rendered by the thin-UI tab: the model output plus the REAL
 * market price/change overlaid from OHLCV (#468). `price`/`change` are
 * authoritative market data, not model output.
 */
export interface Etf extends EtfModelOutput {
  /** Real current price from the OHLCV overlay (#468), not model-authored. */
  price: number;
  /** Real daily change percentage from the OHLCV overlay (#468), not model-authored. */
  change: number;
}

/** Output of the `runEtfs` engine: the finished, price-overlaid shortlist. */
export interface RunEtfsResponse {
  etfs: Etf[];
  /** ISO timestamp the shortlist was produced (provenance/freshness). */
  generatedAt: string;
}

// ===========================================================================
// Examples (compile-time guards keeping types and intent aligned)
// ===========================================================================

/** Model-output example (provider payload — no price/change). */
export const exampleEtfModelOutput = {
  ticker: 'VAS.AX',
  name: 'Vanguard Australian Shares Index ETF',
  category: 'Index',
  expenseRatio: 0.1,
  recommendationSignal: 'pick',
  analysis:
    'Core Australian equity exposure tracking the S&P/ASX 300 across 300+ holdings, with an ultra-low 0.10% MER making it highly cost-effective for long-term core allocation at the supplied price.',
} as const satisfies EtfModelOutput;

/** Enriched ETF example (price/change overlaid from OHLCV). */
export const exampleEtf = {
  ...exampleEtfModelOutput,
  price: 107.67,
  change: 2.22,
} as const satisfies Etf;

/** Request example. */
export const exampleRunEtfsRequest = {
  market: 'ASX',
  searchMode: 'live',
} as const satisfies RunEtfsRequest;

/** Response example. */
export const exampleRunEtfsResponse = {
  etfs: [exampleEtf],
  generatedAt: '2026-06-07T00:00:00.000Z',
} as const satisfies RunEtfsResponse;
