/**
 * Canonical Metals contract (#627) — DEFINED HERE FOR THE FIRST TIME.
 *
 * Background
 * ----------
 * Metals was historically a client-side, free-text, schema-less AI call living
 * entirely in `metals-tab.tsx` (the app-local `Metal` interface). Like the old
 * Recommendations (#592) and ETFs (#626) surfaces, it had the
 * *pricing-before-signal* shape: the model authored `price`, `ytdChange`,
 * `todayChange`, the 52-week range AND the `signal`/`analysis` in one free-text
 * payload — so every number was hallucinated and the signal was formed against
 * invented data rather than real spot prices.
 *
 * #627 re-architects Metals as a backend engine (`runMetals`), mirroring
 * #592/#626's two-stage flow but with a METALS FEED rather than an OHLCV
 * equities overlay:
 *   1. fetch REAL spot data from a metals feed (metals.dev — XAU/XAG/XPT/XPD
 *      spot + change + history);
 *   2. SUPPLY that real data to the model, which then authors ONLY the `signal`
 *      and `outlook`, grounded on it.
 *
 * This file is the CONTRACT only — the request/response shape. Building the
 * engine + the metals.dev integration is the runtime's job, against this
 * contract. The structured-output JSON Schema for the model's payload lives in
 * `./structured-output` (registry surface `metals`) and is built from
 * {@link MetalModelOutput} here.
 *
 * Fixed universe
 * --------------
 * Unlike ETFs (market-keyed) or Recommendations (universe | mode | sector),
 * Metals is a FIXED four-metal universe (Gold, Silver, Platinum, Palladium).
 * There is no discovery, market, or mode dimension, so the cache scope is a
 * single constant (`metals:default`).
 *
 * Authoring note (dependency-free): like the rest of `contracts/`, this file is
 * pure TypeScript types + `satisfies` example guards. No runtime dependencies.
 */

import type { SearchMode } from './cache-freshness';

// ===========================================================================
// 1) SIGNAL — reuse the BULL | NEUTRAL | BEAR trend vocabulary
// ===========================================================================

/**
 * Metals keep the existing trend vocabulary (`BULL | NEUTRAL | BEAR`). This is
 * the SAME value set as the design-system `TrendSignal` used by `TrendBadge`;
 * it is redeclared here (rather than imported from a component) so `contracts/`
 * stays dependency-free and canonical. The tab maps this straight onto
 * `TrendBadge`.
 *
 * Model-authored, but grounded: the engine forms the signal FROM the supplied
 * real spot/change/history data — it is not free-invented (see
 * `metals.behaviour.md`).
 */
export type MetalSignal = 'BULL' | 'NEUTRAL' | 'BEAR';

export const METAL_SIGNALS = ['BULL', 'NEUTRAL', 'BEAR'] as const satisfies readonly MetalSignal[];

export function isMetalSignal(value: unknown): value is MetalSignal {
  return typeof value === 'string' && (METAL_SIGNALS as readonly string[]).includes(value);
}

// ===========================================================================
// 2) UNIVERSE — the fixed four metals
// ===========================================================================

/** The precious-metal spot symbol (feed identifier, e.g. metals.dev XAU/USD). */
export type MetalSymbol = 'XAU/USD' | 'XAG/USD' | 'XPT/USD' | 'XPD/USD';

export const METAL_SYMBOLS = [
  'XAU/USD',
  'XAG/USD',
  'XPT/USD',
  'XPD/USD',
] as const satisfies readonly MetalSymbol[];

export function isMetalSymbol(value: unknown): value is MetalSymbol {
  return typeof value === 'string' && (METAL_SYMBOLS as readonly string[]).includes(value);
}

/**
 * Static, non-market identity for a metal: display name, feed symbol, and the
 * Perth Mint ETF the "Analyse" clickthrough targets. This is CONFIG, not feed
 * data and not model output — it never changes between runs. The per-metal
 * Perth Mint targets are preserved from the existing tab:
 *  - Gold      → PMGOLD.AX
 *  - Silver    → ETPMAG.AX
 *  - Platinum  → ETPMPT.AX
 *  - Palladium → ETPMPD.AX
 */
export interface MetalIdentity {
  name: string;
  symbol: MetalSymbol;
  /** Perth Mint ETF ticker the "Analyse" clickthrough opens. */
  perthMintTicker: string;
  /** Perth Mint product display name. */
  perthMintName: string;
}

/** Canonical fixed identity table for the four metals (config, not feed/model). */
export const METAL_IDENTITIES: readonly MetalIdentity[] = [
  { name: 'Gold', symbol: 'XAU/USD', perthMintTicker: 'PMGOLD.AX', perthMintName: 'Perth Mint Gold' },
  { name: 'Silver', symbol: 'XAG/USD', perthMintTicker: 'ETPMAG.AX', perthMintName: 'Perth Mint Silver' },
  { name: 'Platinum', symbol: 'XPT/USD', perthMintTicker: 'ETPMPT.AX', perthMintName: 'Perth Mint Platinum' },
  { name: 'Palladium', symbol: 'XPD/USD', perthMintTicker: 'ETPMPD.AX', perthMintName: 'Perth Mint Palladium' },
] as const;

// ===========================================================================
// 3) FEED DATA — supplied by the metals feed, NEVER model-authored
// ===========================================================================

/**
 * Real spot data supplied by the metals feed (metals.dev), NOT authored by the
 * model. This is the metals analogue of the OHLCV overlay (#468): the engine
 * fetches it (stage 1), supplies it to the model as input, and overlays it for
 * display (stage 2). All prices are USD per troy ounce.
 */
export interface MetalFeedData {
  /** Current spot price, USD/oz. Feed-supplied. */
  spotPrice: number;
  /** Current spot price, AUD/oz. Feed-supplied (#627 amendment). */
  audSpotPrice: number;
  /** Today's change percentage. Feed-supplied. */
  todayChange: number;
  /** Year-to-date change percentage. Feed-supplied. */
  ytdChange: number;
  /**
   * Trailing 30-day change percentage (#627 amendment). NULLABLE: `null` until
   * 30 days of stored daily closes exist for the metal — the runtime computes it
   * from its own stored close history, not from the feed's point-in-time payload,
   * so it is unavailable on a cold history. The UI renders `null` as "—".
   */
  change30d: number | null;
}

// ===========================================================================
// 4) REQUEST — what runMetals takes
// ===========================================================================

/**
 * Input to the `runMetals` engine. Metals has NO scoping dimension (fixed
 * four-metal universe), so the only knob is `searchMode` — the Fast/Live toggle
 * (`'fast'` = model/training data, no web call; `'live'` = live fetch). A manual
 * refresh in the tab issues a `live` request.
 */
export interface RunMetalsRequest {
  searchMode: SearchMode;
}

// ===========================================================================
// 5) RESPONSE — the per-metal shape
// ===========================================================================

/**
 * The MODEL OUTPUT for a single metal — the provider payload the structured
 * schema validates. The model authors ONLY the `signal` and `outlook`, keyed to
 * the metal by `symbol`. It deliberately does NOT carry any price data
 * (`spotPrice`/`audSpotPrice`/`todayChange`/`ytdChange`/`change30d`): those are
 * REAL feed data (metals.dev + stored close history), supplied to the model as
 * INPUT and overlaid for display — never authored by the model. This is the
 * structural fix for the pricing-before-signal shape.
 *
 * Dropped vs. the old client-side `Metal` shape: the model-authored `price`/
 * `ytdChange`/`todayChange` became feed data; `weekLow`/`weekHigh` were removed
 * entirely (#627 amendment) in favour of `audSpotPrice` + nullable `change30d`;
 * and `analysis` was renamed → `outlook`. The `name`/`symbol`/`ticker`/Perth-Mint
 * fields move to the static {@link MetalIdentity} config, not the model payload.
 */
export interface MetalModelOutput {
  /** Which metal this output is for (join key to feed data + identity). */
  symbol: MetalSymbol;
  /** BULL | NEUTRAL | BEAR — model-authored, grounded on the supplied feed data. */
  signal: MetalSignal;
  /**
   * Qualitative outlook prose. MUST reason on GROUNDED facts (the supplied real
   * USD/AUD spot price, today/YTD change, and 30-day change when available) and
   * MUST NOT assert precise unverified figures it has not been supplied. See
   * `metals.behaviour.md`.
   */
  outlook: string;
}

/**
 * A finished metal as rendered by the thin-UI tab: the static identity + the
 * real feed data + the model's signal/outlook. `spotPrice` and the change/range
 * numbers are authoritative feed data, not model output.
 */
export interface Metal extends MetalIdentity, MetalFeedData {
  signal: MetalSignal;
  outlook: string;
}

/** Output of the `runMetals` engine: the finished, feed-overlaid four metals. */
export interface RunMetalsResponse {
  metals: Metal[];
  /** ISO timestamp the data was produced (provenance/freshness). */
  generatedAt: string;
}

// ===========================================================================
// Examples (compile-time guards keeping types and intent aligned)
// ===========================================================================

/** Model-output example (provider payload — signal + outlook only, no prices). */
export const exampleMetalModelOutput = {
  symbol: 'XAU/USD',
  signal: 'NEUTRAL',
  outlook:
    'At the supplied spot, gold consolidates as safe-haven demand from geopolitical tension is offset by firm real yields; the muted today/30-day move against a solid YTD gain supports a balanced stance rather than a directional call.',
} as const satisfies MetalModelOutput;

/** Feed-data example (metals.dev supplied — not model-authored). */
export const exampleMetalFeedData = {
  spotPrice: 4754,
  audSpotPrice: 7314,
  todayChange: -1.19,
  ytdChange: 14.2,
  change30d: 3.1,
} as const satisfies MetalFeedData;

/** Enriched metal example (identity + feed data + model signal/outlook). */
export const exampleMetal = {
  name: 'Gold',
  symbol: 'XAU/USD',
  perthMintTicker: 'PMGOLD.AX',
  perthMintName: 'Perth Mint Gold',
  ...exampleMetalFeedData,
  signal: 'NEUTRAL',
  outlook: exampleMetalModelOutput.outlook,
} as const satisfies Metal;

/** Request example (live fetch). */
export const exampleRunMetalsRequest = {
  searchMode: 'live',
} as const satisfies RunMetalsRequest;

/** Response example. */
export const exampleRunMetalsResponse = {
  metals: [exampleMetal],
  generatedAt: '2026-06-07T00:00:00.000Z',
} as const satisfies RunMetalsResponse;
