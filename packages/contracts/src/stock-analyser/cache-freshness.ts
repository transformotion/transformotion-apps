import type { ISODateTime } from '../_shared/api';
import type { AnalysisCacheEntry } from './types';

/**
 * Cache freshness model (canonical).
 *
 * Stock Analyser cache status badges are derived from how much of a cache
 * entry's TTL has elapsed — never from hardcoded labels. One TTL-relative rule
 * applies across every Stock Analyser surface (Market, Recommendations,
 * Analyser, ETFs, Metals).
 *
 * The classification thresholds are an app-level policy
 * ({@link StockAnalyserCacheFreshnessPolicy}), not magic literals. With the
 * default policy (fresh < 25%, stale >= 75% of TTL elapsed):
 *  - `fresh`:    elapsed ratio `< freshUntilElapsedRatio`
 *  - `recent`:   `>= freshUntilElapsedRatio` and `< staleFromElapsedRatio`
 *  - `stale`:    `>= staleFromElapsedRatio` and `<= 1`
 *  - `outdated`: `> 1` (past expiry), only when `showOutdatedState` is true
 *
 * `outdated` is only ever reached once `now >= expiresAt`, i.e. when the UI is
 * intentionally serving past-expiry data. Surfaces that never serve expired
 * results simply do not reach this state in normal flows, so it does not appear
 * in normal tab examples — but it remains a valid, derivable state.
 */
export type CacheFreshness = 'fresh' | 'recent' | 'stale' | 'outdated';

/**
 * App-level cache freshness policy (NOT a per-user preference).
 *
 * This configures the *classification thresholds* used to map elapsed-TTL
 * fraction onto a freshness band. It is display/classification only: changing
 * it does NOT change cache expiry, cache writes, background refresh, or the
 * DynamoDB TTL — only which badge a given cache age renders as.
 *
 * The product labels (`fresh`/`recent`/`stale`/`outdated`) and the relative-age
 * text (`Updated 8 minutes ago`) are intentionally NOT configurable.
 */
export interface StockAnalyserCacheFreshnessPolicy {
  /** `fresh` while elapsed TTL fraction is `< freshUntilElapsedRatio`. */
  freshUntilElapsedRatio: number;
  /** `stale` once elapsed TTL fraction is `>= staleFromElapsedRatio`. */
  staleFromElapsedRatio: number;
  /**
   * Whether past-expiry data is classified as `outdated`. When `false`,
   * past-expiry entries fall back to the worst in-TTL band (`stale`).
   */
  showOutdatedState: boolean;
}

/** Canonical default app-level freshness policy: 25% / 75%, outdated shown. */
export const DEFAULT_CACHE_FRESHNESS_POLICY: StockAnalyserCacheFreshnessPolicy = {
  freshUntilElapsedRatio: 0.25,
  staleFromElapsedRatio: 0.75,
  showOutdatedState: true,
};

/** Minimum required gap between the fresh and stale ratios. */
export const MIN_FRESHNESS_RATIO_GAP = 0.05;

/**
 * Validate an app-level freshness policy. Rules:
 *  - `freshUntilElapsedRatio >= 0`
 *  - `staleFromElapsedRatio <= 1`
 *  - `freshUntilElapsedRatio < staleFromElapsedRatio`
 *  - gap (`stale - fresh`) `>= MIN_FRESHNESS_RATIO_GAP`
 *  - both ratios finite numbers; `showOutdatedState` boolean
 */
export function isValidCacheFreshnessPolicy(
  policy: Partial<StockAnalyserCacheFreshnessPolicy> | null | undefined,
): policy is StockAnalyserCacheFreshnessPolicy {
  if (!policy) return false;
  const { freshUntilElapsedRatio: fresh, staleFromElapsedRatio: stale, showOutdatedState } = policy;
  if (typeof fresh !== 'number' || !Number.isFinite(fresh)) return false;
  if (typeof stale !== 'number' || !Number.isFinite(stale)) return false;
  if (typeof showOutdatedState !== 'boolean') return false;
  if (fresh < 0) return false;
  if (stale > 1) return false;
  if (fresh >= stale) return false;
  if (stale - fresh < MIN_FRESHNESS_RATIO_GAP) return false;
  return true;
}

/**
 * Resolve an effective policy: returns the given policy when valid, otherwise
 * falls back to {@link DEFAULT_CACHE_FRESHNESS_POLICY}. Runtime must reject
 * invalid *persisted* policy updates; mocks/UI fall back to defaults so the
 * badges always render.
 */
export function resolveCacheFreshnessPolicy(
  policy?: Partial<StockAnalyserCacheFreshnessPolicy> | null,
): StockAnalyserCacheFreshnessPolicy {
  return isValidCacheFreshnessPolicy(policy) ? policy : DEFAULT_CACHE_FRESHNESS_POLICY;
}

/**
 * A named, reusable freshness policy. Presets are app-level admin
 * configuration: admins apply one to the active policy, edit its thresholds, or
 * create their own. `builtIn` presets ship with the app and cannot be deleted
 * (they can still be applied, and `resetCacheFreshnessConfig` restores them).
 */
export interface CacheFreshnessPreset {
  id: string;
  label: string;
  policy: StockAnalyserCacheFreshnessPolicy;
  builtIn: boolean;
}

/** Built-in presets seeded into a fresh config record. Balanced == default. */
export const DEFAULT_CACHE_FRESHNESS_PRESETS: CacheFreshnessPreset[] = [
  {
    id: 'conservative',
    label: 'Conservative',
    policy: { freshUntilElapsedRatio: 0.15, staleFromElapsedRatio: 0.5, showOutdatedState: true },
    builtIn: true,
  },
  {
    id: 'balanced',
    label: 'Balanced',
    policy: { ...DEFAULT_CACHE_FRESHNESS_POLICY },
    builtIn: true,
  },
  {
    id: 'aggressive',
    label: 'Aggressive',
    policy: { freshUntilElapsedRatio: 0.5, staleFromElapsedRatio: 0.9, showOutdatedState: true },
    builtIn: true,
  },
];

/** Validate a single preset (id + non-empty label + valid policy). */
export function isValidCacheFreshnessPreset(
  preset: Partial<CacheFreshnessPreset> | null | undefined,
): preset is CacheFreshnessPreset {
  if (!preset) return false;
  if (typeof preset.id !== 'string' || preset.id.length === 0) return false;
  if (typeof preset.label !== 'string' || preset.label.trim().length === 0) return false;
  if (typeof preset.builtIn !== 'boolean') return false;
  return isValidCacheFreshnessPolicy(preset.policy);
}

/**
 * App-scoped persisted cache-freshness configuration (the active policy plus the
 * admin's preset library). App-owned and admin-edited, mirroring the AI runtime
 * config record; NOT a per-user preference. Canonical key shape:
 * `pk: 'SETTINGS'`, `sk: 'CACHE_FRESHNESS#stock-analyser'`.
 *
 * Authorization: site-admin OR stock-app-admin (the `/cache-freshness` route is
 * marked `auth: 'account'` as the coarse contract marker; runtime enforces the
 * admin rule, and the UI gates editing behind the same check).
 */
export interface CacheFreshnessConfigRecord {
  pk: 'SETTINGS';
  sk: 'CACHE_FRESHNESS#stock-analyser';
  activePolicy: StockAnalyserCacheFreshnessPolicy;
  presets: CacheFreshnessPreset[];
  updatedAt: ISODateTime;
}

/** A fresh config record: default active policy + the built-in presets. */
export function defaultCacheFreshnessConfigRecord(
  updatedAt: ISODateTime = '2026-06-07T00:00:00.000Z',
): CacheFreshnessConfigRecord {
  return {
    pk: 'SETTINGS',
    sk: 'CACHE_FRESHNESS#stock-analyser',
    activePolicy: { ...DEFAULT_CACHE_FRESHNESS_POLICY },
    presets: DEFAULT_CACHE_FRESHNESS_PRESETS.map((p) => ({ ...p, policy: { ...p.policy } })),
    updatedAt,
  };
}

export const exampleCacheFreshnessConfigRecord: CacheFreshnessConfigRecord =
  defaultCacheFreshnessConfigRecord();

/**
 * Per-surface cache TTLs in seconds (current assumptions).
 *  - 24h TTL: fresh 0–6h, recent 6–18h, stale 18–24h, outdated >24h
 *  - 2h  TTL: fresh 0–30m, recent 30–90m, stale 90–120m, outdated >120m
 *  - 48h TTL: fresh 0–12h, recent 12–36h, stale 36–48h, outdated >48h
 */
export const STOCK_ANALYSER_CACHE_TTL_SECONDS = {
  market: 24 * 60 * 60,
  recs: 24 * 60 * 60,
  analyser: 24 * 60 * 60,
  // Metals moved 2h -> 24h (#627): spot data is refreshed by the daily warm job
  // (#530 principle), so a 24h TTL aligns the cache lifetime with the warm cadence.
  metals: 24 * 60 * 60,
  etfs: 48 * 60 * 60,
  portfolio: 24 * 60 * 60,
  watchlist: 24 * 60 * 60,
} as const;

export type StockAnalyserCacheSurface = keyof typeof STOCK_ANALYSER_CACHE_TTL_SECONDS;

export interface CacheFreshnessResult {
  freshness: CacheFreshness;
  /** Fraction of TTL elapsed (0..>1). */
  fractionElapsed: number;
  /** Whole seconds since `cachedAt`. */
  ageSeconds: number;
  /** Seconds until expiry; negative once past expiry. */
  remainingSeconds: number;
}

/**
 * Derive freshness from cache metadata using an app-level policy. All times are
 * unix seconds. When `policy` is omitted (or invalid), the canonical default
 * policy is used. Returns `outdated` once `now >= expiresAt` (when the policy
 * enables it); callers decide whether to render past-expiry data.
 */
export function deriveCacheFreshness(
  params: {
    cachedAt: number;
    expiresAt: number;
    now?: number;
  },
  policy?: Partial<StockAnalyserCacheFreshnessPolicy> | null,
): CacheFreshnessResult {
  const { freshUntilElapsedRatio, staleFromElapsedRatio, showOutdatedState } =
    resolveCacheFreshnessPolicy(policy);
  const now = params.now ?? Math.floor(Date.now() / 1000);
  const ttlSeconds = Math.max(1, params.expiresAt - params.cachedAt);
  const ageSeconds = Math.max(0, now - params.cachedAt);
  const remainingSeconds = params.expiresAt - now;
  const fractionElapsed = ageSeconds / ttlSeconds;

  let freshness: CacheFreshness;
  if (remainingSeconds <= 0) {
    // Past expiry: classify as `outdated` only when the policy shows it,
    // otherwise fall back to the worst in-TTL band.
    freshness = showOutdatedState ? 'outdated' : 'stale';
  } else if (fractionElapsed < freshUntilElapsedRatio) {
    freshness = 'fresh';
  } else if (fractionElapsed < staleFromElapsedRatio) {
    freshness = 'recent';
  } else {
    freshness = 'stale';
  }

  return { freshness, fractionElapsed, ageSeconds, remainingSeconds };
}

/**
 * Relative age text computed from `cachedAt`, e.g. `just now`, `8 minutes ago`,
 * `2 hours ago`, `3 days ago`. Never a canned/hardcoded string.
 */
export function formatRelativeAge(cachedAt: number, now?: number): string {
  const ref = now ?? Math.floor(Date.now() / 1000);
  const delta = Math.max(0, ref - cachedAt);
  if (delta < 60) return 'just now';
  const minutes = Math.floor(delta / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

/** `Updated <relative age>` for the `CacheStatusBar.lastUpdated` slot. */
export function formatLastUpdated(cachedAt: number, now?: number): string {
  return `Updated ${formatRelativeAge(cachedAt, now)}`;
}

/**
 * The Live/Fast search mode for an analysis fetch. Mirrors the app-wide
 * `defaultSearchMode` setting and the optional `AnalysisCacheEntry.mode`.
 *  - `live` — `callClaude({ webSearch: true })`: live market/web call.
 *  - `fast` — `callClaude({ webSearch: false })`: model answers from training
 *    data; no live market call.
 */
export type SearchMode = 'live' | 'fast';

/**
 * Canonical "is this cache entry past its TTL?" predicate. An entry is expired
 * once `now >= expiresAt` (i.e. `remainingSeconds <= 0`), independent of the
 * display freshness policy. This is the cache-read cutoff used by the unified
 * Run / Re-run flow: a non-expired entry is served without a fetch; an expired
 * (or missing) entry triggers a fetch.
 */
export function isCacheExpired(
  entry: Pick<AnalysisCacheEntry, 'cachedAt' | 'expiresAt'>,
  now?: number,
): boolean {
  return deriveCacheFreshness({ ...entry, now }).remainingSeconds <= 0;
}

/**
 * Build an `AnalysisCacheEntry<T>` for a surface using its canonical TTL.
 * `cachedAt` defaults to the supplied `now` (or wall-clock seconds); `expiresAt`
 * is `cachedAt + STOCK_ANALYSER_CACHE_TTL_SECONDS[surface]`. Pass `mode` to
 * record whether the data came from a live or fast fetch.
 */
export function makeAnalysisCacheEntry<T>(
  surface: StockAnalyserCacheSurface,
  data: T,
  opts?: { now?: number; mode?: SearchMode },
): AnalysisCacheEntry<T> {
  const cachedAt = opts?.now ?? Math.floor(Date.now() / 1000);
  return {
    data,
    cachedAt,
    expiresAt: cachedAt + STOCK_ANALYSER_CACHE_TTL_SECONDS[surface],
    ...(opts?.mode ? { mode: opts.mode } : {}),
  };
}

/**
 * Compose the scope-keyed cache key for an analysis surface:
 * `"{surface}:{scopeKey}"`. The scope dimension is surface-specific and is
 * supplied by the caller (the tab), so distinct scopes never share a slot:
 *  - `market`   → region            e.g. `market:australia`
 *  - `etfs`     → market            e.g. `etfs:US`
 *  - `analyser` → ticker            e.g. `analyser:BHP.AX`
 *  - `recs`     → universe + mode   e.g. `recs:ASX|top-picks`
 *  - `metals`   → none (constant)   e.g. `metals:default`
 */
export function analysisCacheKey(
  surface: StockAnalyserCacheSurface,
  scopeKey: string = 'default',
): string {
  return `${surface}:${scopeKey}`;
}

/**
 * Derive the full badge state (freshness + age strings) for a cache entry.
 * When `entry` is `null` (e.g. a live result just generated, no cache metadata
 * yet), the surface is treated as `fresh` / `Updated just now` — chosen over
 * hiding status so the badge stays present and consistent across surfaces.
 */
export function deriveCacheStatus(
  entry: Pick<AnalysisCacheEntry, 'cachedAt' | 'expiresAt'> | null,
  now?: number,
  policy?: Partial<StockAnalyserCacheFreshnessPolicy> | null,
): { freshness: CacheFreshness; lastUpdated: string; cacheAge: string } {
  if (!entry) {
    return { freshness: 'fresh', lastUpdated: 'Updated just now', cacheAge: 'just now' };
  }
  const { freshness } = deriveCacheFreshness({ ...entry, now }, policy);
  return {
    freshness,
    lastUpdated: formatLastUpdated(entry.cachedAt, now),
    cacheAge: formatRelativeAge(entry.cachedAt, now),
  };
}
