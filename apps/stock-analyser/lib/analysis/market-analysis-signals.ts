/**
 * Market Analysis — shared prompt + system message (M19 #584).
 *
 * The SINGLE source of the Market Analysis computation, used by BOTH:
 *   - the live Market tab (components/.../market-analysis-tab.tsx), and
 *   - the daily cache-warming job (functions/notification-engine).
 *
 * This is the same pattern as the per-ticker `stock-analysis-signals.ts`: by
 * importing ONE prompt definition, the warmed `MARKET#{region}` cache entry is
 * identical-by-construction to what a live Market-tab run produces. There must
 * be exactly one copy of this prompt — do NOT inline it in either caller.
 *
 * NOTE: the live path writes the RAW model output to the `MARKET#{region}`
 * cache; the per-card universe enrichment (`recommendationUniverse`,
 * `sourceRegion`) is applied CLIENT-SIDE on read (see the tab). So warm === live
 * at the cache requires only the same prompt/system/grounding — which this
 * module provides. The enrichment intentionally stays in the tab.
 */

import {
  REGION_TO_RECOMMENDATION_UNIVERSES,
  type AnalysisRegion,
} from '@transformotion/contracts/stock-analyser/types';

/** Human label per region — single source (re-exported by components/markets.ts). */
export const REGION_LABELS: Record<AnalysisRegion, string> = {
  global: 'Global',
  australia: 'Australia',
  us: 'US',
  uk: 'UK',
};

export const MARKET_ANALYSIS_SYSTEM_PROMPT =
  "You are a senior market strategist. Provide institutional-quality sector rotation analysis grounded in authoritative, attributable sources. For every macro indicator and sector card, name the authoritative source you relied on (exchanges, central banks, regulators, established financial press) and never base figures on social media, forums, or unattributed aggregators. Respond with raw JSON only. Do not use markdown code fences.";

/**
 * Output-token budget for the Market Analysis Live two-pass (#601/market). The
 * Pass-1 grounded RESEARCH pass must cover BOTH region macro AND every mapped
 * sector; at the provider default (4000) that research truncated for
 * content-heavy regions (e.g. US), dropping the macro section entirely and
 * leaving sectors with bare proxy returns (macro cards read "Grounded research
 * incomplete"). 12000 gives the research pass room to reach macro + all sectors,
 * and the format pass still fits well under it. BOTH call sites (the #584 warm
 * job and the interactive Market tab) MUST pass this so warm + interactive stay
 * identical.
 */
export const MARKET_ANALYSIS_MAX_TOKENS = 12000;

/**
 * Build the Market Analysis prompt for a region. `suppliedSectorData` is the
 * #535 Bucket-1 grounding block (real sector OHLCV summary), or `''` when a
 * region has no proxies — both callers MUST pass the same grounding so the
 * resulting prompt (and therefore the model output) is identical.
 */
export function createMarketAnalysisPrompt(region: AnalysisRegion, suppliedSectorData: string): string {
  const supportedUniverses = REGION_TO_RECOMMENDATION_UNIVERSES[region];
  return `Provide comprehensive market analysis for the ${REGION_LABELS[region]} region.

SOURCE ATTRIBUTION (required, per card): For EACH macro indicator and EACH sector, name the authoritative source you based that card's read on and return it as "source": { "name": string } (e.g. "RBA", "ASX", "EIA"). Prefer authoritative / primary sources — exchanges, central banks, regulators, and established financial press. DO NOT base figures on social media, forums, or unattributed aggregators. Source attribution applies ONLY to the macro indicators and sector cards — NOT to "briefing" or "actionSummary".${suppliedSectorData}

Return a JSON object with the following fields:

"macro" — 4 market condition cards, each with label, title, description, impact ("Supportive" / "Neutral" / "Headwind"), and source ({ name: string }):
  - cycleStage — where the market is in the economic cycle
  - rateDirection — current interest rate trend
  - keyRisk — primary macro risk to watch
  - currency — USD/currency effect on the market

"briefing" — a 2-3 sentence narrative paragraph summarising the macro outlook (synthesis — no source field)

"sectors" — array of 8 sectors, each with:

  - sector: sector name — one of: Financials, Materials, Energy, Healthcare, Technology, Industrials, Consumer Discretionary, Real Estate & REITs

  - signal: exactly one of "enter" / "HOLD" / "EXIT" — use these exact strings ("enter" is lower-case, the other two upper-case).
    The overall sector action: "enter" = enter / overweight, "HOLD" = maintain, "EXIT" = exit / reduce. Synthesise cycle position, valuation, and momentum.

  - cyclePosition: integer 0–100
    Where the sector sits in its economic cycle.
    0 = early cycle (just beginning to recover/accelerate)
    50 = mid cycle (established trend, neither early nor late)
    100 = late cycle (extended, peak territory, vulnerable to rotation out)
    This is a POSITIONAL metric only — it does not imply good or bad.

  - valuation: one of "Cheap" / "Attractive" / "Fair" / "Expensive" / "Overvalued" / "Extended"
    How the sector is priced relative to its own fundamentals and history.
    INDEPENDENT of cyclePosition. A sector can be late-cycle but cheap (if beaten down), or early-cycle but expensive (if priced on expectations).

  - change: weekly % change (number, e.g. 2.1 or -0.8)
    Where SUPPLIED SECTOR DATA is given for a sector, base its level/return read on those figures, not on searched or recalled numbers.

  - reason: 1-2 sentence explanation tying the dimensions together.
    Example: "Late-cycle but still cheap on forward earnings; defensive qualities attractive as growth slows."

  - bestExchange: the best listing universe for this sector. MUST be one of: ${supportedUniverses.join(", ")}

  - source: { name: string } — the authoritative source this sector's read is based on (use the supplied proxy where given for that sector)

"actionSummary" — top-3 trades (conclusions — no source field):
  - enter: array of top 3 { sector, reason } to buy/overweight
  - exit: array of top 3 { sector, reason } to sell/reduce

IMPORTANT: Your entire response must be a single valid JSON object. Begin your response with { and end with }. Do not include any text, preamble, explanation, or markdown outside the JSON.`;
}
