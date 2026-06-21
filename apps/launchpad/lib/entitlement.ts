/**
 * Pure entitlement + display helpers for the Launchpad home view.
 *
 * Tile visibility is GROUPS-AUTHORITATIVE (M11): a tile shows when the viewer
 * holds the app's `{app}-app-access` Cognito group (or is site-admin / app-admin
 * for it) — NOT when they hold a membership. A viewer who holds the access group
 * with ZERO accounts (the "access, no accounts" state produced by an app-grant
 * invitation) sees a distinct "create your first account" tile. Each app's tile
 * reflects its own state independently.
 *
 * Everything here is pure and framework-free so it can be unit-tested without a
 * DOM; the React component maps slugs to icons/launch/create handlers.
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
  /** Should the tile render at all (viewer can see this app). */
  visible: boolean;
  /** Tile is a normal launch tile (deployed, visible, and the viewer has an account). */
  launchable: boolean;
  /**
   * Viewer holds the `{app}-app-access` group but has ZERO accounts in this app
   * — the "access, no accounts" state. The tile renders a create-first-account
   * CTA instead of a launch action. Site-admins / app-admins WITHOUT the access
   * group are NOT first-account candidates (they see the app via their role).
   */
  needsFirstAccount: boolean;
}

/** The viewer's group-authoritative access, as the launchpad gate keys on it. */
export interface ViewerEntitlement {
  /** site-admin sees every deployed app. */
  siteAdmin: boolean;
  /** Apps the viewer admins (`{app}-app-admin` groups). */
  appAdmin: ReadonlySet<string>;
  /** Apps the viewer may ENTER (`{app}-app-access` groups) — the tile-visibility key. */
  appAccess: ReadonlySet<string>;
  /** Apps the viewer holds >=1 account in (active-account selections / accounts claim). */
  accounted: ReadonlySet<string>;
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
 * Resolve which tiles render for a viewer, group-authoritatively (M11).
 *
 *  - not entitlement-gated (coming-soon) OR not deployed → hidden.
 *  - gated + deployed + (site-admin OR app-admin OR holds the access group) → visible.
 *      · holds the access group but NO account → `needsFirstAccount` (create CTA).
 *      · otherwise → `launchable` (normal open tile).
 *  - gated + deployed + none of the above → hidden.
 *
 * Tolerant of unknown slugs and empty sets — simply yields no visible gated
 * tiles (the empty state), never an error.
 */
export function deriveAppTiles(
  apps: readonly LaunchpadAppDef[],
  viewer: ViewerEntitlement,
): AppTile[] {
  return apps.map((app) => {
    if (!app.entitlementGated || !app.deployed) {
      return { ...app, visible: false, launchable: false, needsFirstAccount: false };
    }
    const canSee = viewer.siteAdmin || viewer.appAdmin.has(app.slug) || viewer.appAccess.has(app.slug);
    const needsFirstAccount = viewer.appAccess.has(app.slug) && !viewer.accounted.has(app.slug);
    const launchable = canSee && !needsFirstAccount;
    return { ...app, visible: canSee, launchable, needsFirstAccount };
  });
}

/** True when at least one tile is visible (otherwise render the empty state). */
export function hasVisibleApps(tiles: readonly AppTile[]): boolean {
  return tiles.some((t) => t.visible);
}

/**
 * Canonical display-name fallback chain (M16 D6):
 *   EXPLICIT profile displayName → Cognito name → email local part.
 *
 * `displayName` is now only present when the user explicitly set one (#494): the
 * user Lambda omits it otherwise, so an unset name no longer beats the token name.
 * The auth client guarantees `cognitoName` (the token name) is a real name or the
 * email local part — never the full address — so the `cognito !== email` guard is
 * defensive belt-and-suspenders. The full email is returned only if there is no
 * usable local part (a malformed address).
 */
export function resolveDisplayName(input: {
  displayName?: string | null;
  cognitoName?: string | null;
  email: string;
}): string {
  const dn = input.displayName?.trim();
  if (dn) return dn;
  const cognito = input.cognitoName?.trim();
  if (cognito && cognito !== input.email) return cognito;
  const localPart = input.email.split('@')[0];
  return localPart || input.email;
}

/** First name for greetings, from a resolved display name. */
export function firstNameOf(displayName: string): string {
  return displayName.split(' ')[0] || displayName;
}

/**
 * Build console warnings when the home view renders from the claims/token
 * fallback rather than the live read APIs, so silent degradation becomes
 * visible (issue #423). Pure — the hook emits these via console.warn.
 */
export function fallbackWarnings(opts: {
  apiConfigured: boolean;
  tilesFromApi: boolean;
  profileFromApi: boolean;
}): string[] {
  const out: string[] = [];
  if (opts.tilesFromApi && opts.profileFromApi) return out;
  if (!opts.apiConfigured) {
    out.push(
      '[launchpad] control-plane API URL not configured — tiles/profile rendered from token-claims fallback (expected in mock/dev).',
    );
    return out;
  }
  if (!opts.tilesFromApi) {
    out.push(
      '[launchpad] active-accounts read failed — app tiles derived from token claims, not the API.',
    );
  }
  if (!opts.profileFromApi) {
    out.push(
      '[launchpad] profile read failed — display name from token fallback, not the API.',
    );
  }
  return out;
}
