/**
 * Pure entitlement + display helpers for the Launchpad home view (M16 Phase 3).
 *
 * Tiles derive from the user's per-app membership (the access projection), NOT
 * from a hard-coded list (ADR D11). Admin/control-plane surfaces gate on the
 * site_admin / app_admin claims elsewhere — never on app membership.
 *
 * Everything here is pure and framework-free so it can be unit-tested without a
 * DOM; the React component maps slugs to icons/launch handlers.
 */

/** Static catalogue of apps the Launchpad knows how to present. */
export interface LaunchpadAppDef {
  /** App slug; for real apps this matches an EntitledAppSlug in the contracts. */
  slug: string;
  name: string;
  description: string;
  /** A real, launchable app (false = future/marketing "coming soon"). */
  deployed: boolean;
  /**
   * Whether visibility is gated by account membership. Real apps (SA/BT) are
   * gated; marketing/coming-soon entries are not (and stay hidden by default,
   * preserving the pre-M16 three-state handling).
   */
  entitlementGated: boolean;
  color: string;
  bgGradient: string;
}

/** One resolved tile for the current user. */
export interface AppTile extends LaunchpadAppDef {
  /** User holds at least one membership in this app. */
  entitled: boolean;
  /** Should the tile render at all. */
  visible: boolean;
  /** Tile is clickable (deployed AND entitled). */
  launchable: boolean;
}

/**
 * The Launchpad app catalogue. Order here is the render order.
 * `transformation-framework` is a not-deployed marketing entry retained to
 * preserve the three-state (deployed / coming-soon / hidden) handling; it stays
 * hidden until a future phase turns coming-soon tiles on.
 */
export const LAUNCHPAD_APPS: readonly LaunchpadAppDef[] = [
  {
    slug: 'stock-analyser',
    name: 'Stock Signal Analyser',
    description: 'Cycle signals across ASX, NASDAQ, Dow Jones and FTSE',
    deployed: true,
    entitlementGated: true,
    color: 'text-primary',
    bgGradient: 'from-primary/20 via-primary/5 to-transparent',
  },
  {
    slug: 'budget-tracker',
    name: 'Budget Tracker',
    description: 'Track spending, savings and cashflow across accounts',
    deployed: true,
    entitlementGated: true,
    color: 'text-signal-green',
    bgGradient: 'from-signal-green/20 via-signal-green/5 to-transparent',
  },
  {
    slug: 'transformation-framework',
    name: 'Transformotion Framework',
    description: 'Business transformation tools and methodologies',
    deployed: false,
    entitlementGated: false,
    color: 'text-signal-gold',
    bgGradient: 'from-signal-gold/20 via-signal-gold/5 to-transparent',
  },
] as const;

/**
 * Derive the set of entitled app slugs from active-account selections
 * (GET /api/user/active-accounts). A selection exists for every app the user
 * holds at least one account in, so the slug set IS the entitlement set.
 */
export function entitledSlugsFromSelections<T extends { appSlug: string }>(
  selections: readonly T[],
): Set<string> {
  return new Set(selections.map((s) => s.appSlug));
}

/**
 * Resolve which tiles render for a user, given their entitled app slugs.
 *
 * Three-state model (D11):
 *  - entitlement-gated + deployed + entitled  → visible, launchable
 *  - entitlement-gated + deployed + NOT entitled → hidden (no membership, no tile)
 *  - not entitlement-gated (coming-soon/future) → hidden by default
 *
 * Backfill tolerant: an unknown/empty entitlement set simply yields no visible
 * gated tiles (the empty state), never an error.
 */
export function deriveAppTiles(
  apps: readonly LaunchpadAppDef[],
  entitledSlugs: ReadonlySet<string>,
): AppTile[] {
  return apps.map((app) => {
    const entitled = entitledSlugs.has(app.slug);
    const visible = app.entitlementGated ? app.deployed && entitled : false;
    const launchable = visible && app.deployed && entitled;
    return { ...app, entitled, visible, launchable };
  });
}

/** True when at least one tile is visible (otherwise render the empty state). */
export function hasVisibleApps(tiles: readonly AppTile[]): boolean {
  return tiles.some((t) => t.visible);
}

/**
 * Canonical display-name fallback chain (M16 D6): displayName → email local
 * part → full email. The backend already resolves displayName this way; this
 * mirror keeps greetings correct when the profile fetch is unavailable and for
 * legacy users with no displayName.
 */
export function resolveDisplayName(input: { displayName?: string | null; email: string }): string {
  const dn = input.displayName?.trim();
  if (dn) return dn;
  const localPart = input.email.split('@')[0];
  return localPart || input.email;
}

/** First name for greetings, from a resolved display name. */
export function firstNameOf(displayName: string): string {
  return displayName.split(' ')[0] || displayName;
}
