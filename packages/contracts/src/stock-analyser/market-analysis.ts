import type { AnalysisRegion, RecommendationUniverse } from './types';

/**
 * Market Analysis result model (canonical) — M19 #535.
 *
 * Promoted from the tab-local shape in
 * `components/stock-analyser/tabs/market-analysis-tab.tsx` (and the archived
 * `_archive/stock-analyser/DATA_CONTRACTS.md`) into the canonical contract,
 * mirroring how the cache-freshness model is owned in `cache-freshness.ts`.
 *
 * Promotion reconciles recent tab-local churn into the canonical shapes:
 *  - `SectorSignal` no longer carries the old `opportunity` band.
 *  - `SectorValuation` is widened to the current surface's bands
 *    (`Cheap | Attractive | Fair | Expensive | Overvalued | Extended`).
 *
 * #535 grounds the surface in attributable data: the LLM still does the
 * synthesis, but EACH card now NAMES the authoritative source(s) it based its
 * read on (see {@link MarketAnalysisCardSource}). Source attribution is a
 * per-card grain and is distinct from cache recency — "where this came from"
 * vs. "how recently it was refreshed". Recency stays owned by the
 * cache-freshness model (`lastUpdated` / `cacheAge`); this contract adds NO
 * second timestamp / data-vintage field.
 */

/** Macro indicator impact on the analysed region/market. */
export type MacroIndicatorImpact = 'Supportive' | 'Neutral' | 'Headwind';

/**
 * Sector valuation band. Reconciled to the bands the current Market Analysis
 * surface emits (widened from the archived doc's narrower union).
 */
export type SectorValuation =
  | 'Cheap'
  | 'Attractive'
  | 'Fair'
  | 'Expensive'
  | 'Overvalued'
  | 'Extended';

/**
 * Sector rotation signal direction emitted by the analysis layer (#593).
 *
 * `enter` is the positive/rotate-in action (label "Enter"). It replaces the old
 * stray `BUY` value, which was mismatched with the surface's ENTER/HOLD/EXIT
 * vocabulary. `HOLD` and `EXIT` are already correct and left as-is.
 *
 * NOTE: `enter` is the exact value #595 smart-warming keys off, so it must not
 * drift. The mixed casing (`enter` vs `HOLD`/`EXIT`) is intentional for now —
 * only the stray value was in scope for #593.
 */
export type SectorSignalDirection = 'enter' | 'HOLD' | 'EXIT';

/**
 * Per-card source attribution (#535 — the net-new field).
 *
 * Names the authoritative source the model based a single card on so the user
 * can SEE where the read came from, e.g. an exchange, central bank, regulator,
 * or established financial press ("RBA", "ASX", "EIA"). Carried at the per-card
 * grain on {@link MacroIndicator} and {@link SectorSignal} ONLY — never on
 * `briefing` or `actionSummary`, which are synthesis/conclusions over
 * everything rather than individually-sourced figures.
 *
 * Bar for #535 is attribution-and-VISIBLE: the model names sources and the user
 * sees them. A hard domain-allowlist VALIDATION is a deferred later upgrade and
 * is intentionally NOT modelled here. Kept as an object (not a bare string) so a
 * later upgrade can add fields (e.g. `url`, `domain`) without a breaking change.
 */
export interface MarketAnalysisCardSource {
  /** Authoritative source name, e.g. "RBA", "ASX", "EIA". */
  name: string;
}

export interface MacroIndicator {
  label: string;
  title: string;
  description: string;
  impact: MacroIndicatorImpact;
  /** #535 per-card source attribution. */
  source: MarketAnalysisCardSource;
}

export interface SectorSignal {
  sector: string;
  signal: SectorSignalDirection;
  /** 0–100 position within the cycle. */
  cyclePosition: number;
  valuation: SectorValuation;
  /** Weekly percentage change. */
  change: number;
  reason: string;
  /** Raw exchange string from the AI layer (free text; may be unsupported). */
  bestExchange: string;
  /**
   * Structured, supported recommendation universe resolved from `bestExchange`
   * within the analysed region. Exposed so click-through carries a valid
   * universe rather than geography.
   */
  recommendationUniverse?: RecommendationUniverse;
  /** The region this result was produced for (provenance only). */
  sourceRegion?: AnalysisRegion;
  /** #535 per-card source attribution. */
  source: MarketAnalysisCardSource;
}

export interface ActionItem {
  sector: string;
  reason: string;
}

export interface MarketAnalysisResult {
  macro: {
    cycleStage: MacroIndicator;
    rateDirection: MacroIndicator;
    keyRisk: MacroIndicator;
    currency: MacroIndicator;
  };
  /** Synthesis paragraph over everything — NOT individually sourced. */
  briefing: string;
  sectors: SectorSignal[];
  /** Conclusions over everything — NOT individually sourced. */
  actionSummary: {
    enter: ActionItem[];
    exit: ActionItem[];
  };
}

export const exampleMacroIndicator = {
  label: 'RATE DIRECTION',
  title: 'Tightening',
  description: 'RBA hiked to 4.35% amid stagflation risks; further hikes likely.',
  impact: 'Headwind',
  source: { name: 'RBA' },
} as const satisfies MacroIndicator;

export const exampleSectorSignal = {
  sector: 'Energy',
  signal: 'enter',
  cyclePosition: 85,
  valuation: 'Cheap',
  change: -19,
  reason: 'Direct beneficiary of the oil crisis with strong free cash flows at elevated prices.',
  bestExchange: 'NYSE',
  source: { name: 'EIA' },
} as const satisfies SectorSignal;

export const exampleMarketAnalysisResult = {
  macro: {
    cycleStage: {
      label: 'CYCLE STAGE',
      title: 'Late Cycle Expansion',
      description: 'Economy at capacity constraints with strong growth but rising inflation pressures.',
      impact: 'Neutral',
      source: { name: 'ABS' },
    },
    rateDirection: exampleMacroIndicator,
    keyRisk: {
      label: 'KEY RISK',
      title: 'Middle East Conflict Stagflation',
      description: 'Oil at $93–105; inflation expectations rising as the RBA warns of a stagflation scenario.',
      impact: 'Headwind',
      source: { name: 'EIA' },
    },
    currency: {
      label: 'USD / CURRENCY',
      title: 'Strong',
      description: 'USD index firmer on safe-haven flows amid geopolitical tensions.',
      impact: 'Supportive',
      source: { name: 'ICE' },
    },
  },
  briefing:
    'The ASX faces a challenging macro backdrop as the RBA shifts to aggressive tightening amid stagflation risks. Strong USD and elevated energy costs threaten commodity-dependent sectors.',
  sectors: [exampleSectorSignal],
  actionSummary: {
    enter: [{ sector: 'Energy', reason: 'Strong pricing power and cash generation through the oil crisis.' }],
    exit: [{ sector: 'Technology', reason: 'Extreme valuations vulnerable to rising rates.' }],
  },
} as const satisfies MarketAnalysisResult;
