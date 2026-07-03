import type { AccountId, ISODateTime, UserId } from '../_shared/api';
import type { AccountRole } from '../_shared/auth';

/**
 * Notification preferences model (canonical, M19 #534).
 *
 * Two grains of configuration drive the M19 notification job:
 *  - ACCOUNT-level config (owner/manager-controlled): how often the job
 *    processes the account ({@link NotificationAccountConfig.intervalDays}) and
 *    which notification types are active ({@link NotificationAccountConfig.activeTypes}).
 *  - PER-MEMBER delivery consent (each write-access member controls their own):
 *    whether THIS member is delivered notifications ({@link NotificationMemberConsent.receiveConsent}).
 *
 * There is deliberately NO account-level master on/off switch — delivery is
 * gated per-member by consent, which defaults OFF (opt-in).
 *
 * The role-conditional VISIBILITY of these controls (who sees what, who may
 * edit what) is encoded here as pure resolvers ({@link resolveNotificationVisibility})
 * so the UI and any runtime presentation share one source of truth. See
 * `notification-preferences.behaviour.md` for the matrix and the load-bearing
 * CONSTRAINT: this visibility model is a UX convenience, NOT access control —
 * runtime MUST enforce authorization server-side regardless of what rendered.
 */

/** The notification types that can be active for an account. */
export type NotificationType = 'portfolio' | 'watchlist';

/** All notification types, in display order. */
export const NOTIFICATION_TYPES: readonly NotificationType[] = ['portfolio', 'watchlist'];

/**
 * Minimum processing interval floor (days). The job cannot be configured to
 * process an account more often than once per day.
 */
export const MIN_NOTIFICATION_INTERVAL_DAYS = 1;

/** Default account-level processing interval (days) for a fresh config. */
export const DEFAULT_NOTIFICATION_INTERVAL_DAYS = 7;

/**
 * ACCOUNT-level notification config, per-account, owner/manager-controlled.
 *
 * Persisted in the Stock Analyser settings store (`stock-analyser.settings`).
 * Canonical key shape: `pk: 'SETTINGS'`, `sk: 'NOTIFICATIONS#${accountId}'`.
 * Because its rows are account-scoped (no user dimension), runtime write-gates
 * it via the D8 control-plane pattern (owner/manager).
 */
export interface NotificationAccountConfig {
  accountId: AccountId;
  /**
   * How often the job processes this account, in whole days. Floored at
   * {@link MIN_NOTIFICATION_INTERVAL_DAYS}.
   */
  intervalDays: number;
  /** Which notification types are active for the account (may be empty). */
  activeTypes: NotificationType[];
  updatedAt: ISODateTime;
}

/**
 * PER-MEMBER delivery consent, per `(account, member)`, each member controls
 * their OWN record. DEFAULT OFF (opt-in).
 *
 * Canonical key shape: `pk: 'NOTIFICATION_CONSENT#${accountId}'`,
 * `sk: 'USER#${userId}'`. Runtime enforces that the writer is writing their own
 * member record; a member can never change another member's consent.
 */
export interface NotificationMemberConsent {
  accountId: AccountId;
  userId: UserId;
  /** Whether THIS member is delivered notifications. Default `false`. */
  receiveConsent: boolean;
  updatedAt: ISODateTime;
}

/** Default for the app-wide notification engine kill-switch: ON. */
export const DEFAULT_NOTIFICATIONS_ENABLED = true;

/**
 * APP-WIDE notification engine config (M19 #571) — the kill-switch.
 *
 * A SINGLE platform-wide record (NOT per-account, NOT per-user) that gates
 * whether the daily market-analysis notification job runs at all. When
 * `notificationsEnabled` is `false`, the job early-returns and NO sends happen
 * for ANYONE until it is re-enabled. Use case: pause sends when AI credit is
 * exhausted. DEFAULT ON.
 *
 * Persisted as a single global settings row (runtime owns the real store).
 * Canonical key shape: `pk: 'SETTINGS'`, `sk: 'NOTIFICATION_ENGINE_CONFIG#stock-analyser'`.
 * Runtime write-gates it to site/app-admin only (see behaviour.md CONSTRAINT).
 */
export interface NotificationEngineConfig {
  /** Whether the notification job is allowed to run platform-wide. Default `true`. */
  notificationsEnabled: boolean;
  /**
   * Per-surface daily-warm gates (M19). OPTIONAL and ABSENT ⇒ every surface ON
   * (zero-migration default). Independent of {@link notificationsEnabled}: the
   * master switch gates the WHOLE run (early-return before anything); these gate
   * individual warm steps WITHIN a run. See {@link WarmSurfaces} /
   * {@link resolveWarmSurfaceState}.
   */
  warmSurfaces?: WarmSurfaces;
  updatedAt: ISODateTime;
}

// ---------------------------------------------------------------------------
// Warm-surface flags (M19 — per-surface daily-warm gating + P&W intent fix)
// ---------------------------------------------------------------------------

/**
 * The daily warm chain's individually-gateable surfaces. Each names a cache the
 * notification engine warms once per run: `market`/`recs`/`etfs`/`metals` are the
 * Layer-A list surfaces; `portfolio`/`watchlist` gate the per-ticker `ANALYSIS#`
 * warm-set built from account holdings (the union of whichever are ON).
 *
 * Because notification evaluation is a pure READER of `ANALYSIS#` (it never
 * computes on miss), a surface's warm flag is ALSO the single spend lever for
 * that surface's notifications: portfolio warm OFF ⇒ no portfolio `ANALYSIS#`
 * written ⇒ portfolio notifications are not generated (and likewise watchlist).
 */
export type WarmSurface = 'market' | 'recs' | 'etfs' | 'metals' | 'portfolio' | 'watchlist';

/** All warm surfaces, in warm-chain order. */
export const WARM_SURFACES: readonly WarmSurface[] = ['market', 'recs', 'etfs', 'metals', 'portfolio', 'watchlist'];

/**
 * Per-surface warm gates. Each key is OPTIONAL and ABSENT MEANS ON — a fresh
 * config (no `warmSurfaces`) warms every surface. Only an explicit `false`
 * disables a surface's warm.
 */
export type WarmSurfaces = Partial<Record<WarmSurface, boolean>>;

/** Raw per-surface flag: absent/`true` ⇒ ON, only explicit `false` ⇒ OFF. */
export function isWarmSurfaceConfigured(warmSurfaces: WarmSurfaces | undefined, surface: WarmSurface): boolean {
  return warmSurfaces?.[surface] !== false;
}

/**
 * Resolved state for one surface: its raw flag, its effective on/off after
 * cross-surface dependency resolution, and (when suppressed) what blocked it.
 */
export interface WarmSurfaceState {
  /** The raw configured flag (absent ⇒ `true`). */
  configured: boolean;
  /** Effective on/off after applying cross-surface dependencies (recs⇒market). */
  effective: boolean;
  /** Set when `configured` is on but a dependency forced `effective` off. */
  blockedBy?: WarmSurface;
}

/**
 * Resolve every warm surface's effective state, applying the ONE cross-surface
 * dependency: **Recs warming requires Market warming.** Recs is fanned out from
 * the sectors a fresh Market warm flags `enter`, so with Market OFF there is
 * nothing to base Recs on. A config with recs ON + market OFF therefore resolves
 * recs to `{ effective: false, blockedBy: 'market' }`. All other surfaces are
 * independent (`effective === configured`).
 *
 * Single source of truth shared by the engine (which surfaces to warm) and the
 * settings UI (which toggle to disable / annotate, and the per-type banners).
 */
export function resolveWarmSurfaceState(
  warmSurfaces: WarmSurfaces | undefined,
): Record<WarmSurface, WarmSurfaceState> {
  const marketOn = isWarmSurfaceConfigured(warmSurfaces, 'market');
  const recsOn = isWarmSurfaceConfigured(warmSurfaces, 'recs');
  const independent = (surface: WarmSurface): WarmSurfaceState => {
    const on = isWarmSurfaceConfigured(warmSurfaces, surface);
    return { configured: on, effective: on };
  };
  return {
    market: independent('market'),
    recs: {
      configured: recsOn,
      effective: recsOn && marketOn,
      ...(recsOn && !marketOn ? { blockedBy: 'market' as const } : {}),
    },
    etfs: independent('etfs'),
    metals: independent('metals'),
    portfolio: independent('portfolio'),
    watchlist: independent('watchlist'),
  };
}

/**
 * Validate a `warmSurfaces` map: absent/`null` is valid (⇒ all ON); otherwise it
 * must be a plain object whose every key is a known {@link WarmSurface} with a
 * boolean value. Unknown keys and non-boolean values are rejected.
 */
export function isValidWarmSurfaces(value: unknown): value is WarmSurfaces {
  if (value === undefined || value === null) return true;
  if (typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.entries(value as Record<string, unknown>).every(
    ([key, v]) => (WARM_SURFACES as readonly string[]).includes(key) && typeof v === 'boolean',
  );
}

/** A fresh engine config: kill-switch ON. */
export function defaultNotificationEngineConfig(
  updatedAt: ISODateTime = '2026-06-07T00:00:00.000Z',
): NotificationEngineConfig {
  return { notificationsEnabled: DEFAULT_NOTIFICATIONS_ENABLED, updatedAt };
}

/** Clamp an interval to a whole number of days at or above the floor. */
export function normalizeIntervalDays(days: number): number {
  if (!Number.isFinite(days)) return MIN_NOTIFICATION_INTERVAL_DAYS;
  return Math.max(MIN_NOTIFICATION_INTERVAL_DAYS, Math.floor(days));
}

/** Type guard for a single notification type. */
export function isNotificationType(value: unknown): value is NotificationType {
  return value === 'portfolio' || value === 'watchlist';
}

/** Validate an account-level config shape. */
export function isValidNotificationAccountConfig(
  config: Partial<NotificationAccountConfig> | null | undefined,
): config is NotificationAccountConfig {
  if (!config) return false;
  if (typeof config.accountId !== 'string' || config.accountId.length === 0) return false;
  if (typeof config.intervalDays !== 'number' || !Number.isFinite(config.intervalDays)) return false;
  if (config.intervalDays < MIN_NOTIFICATION_INTERVAL_DAYS) return false;
  if (!Array.isArray(config.activeTypes) || !config.activeTypes.every(isNotificationType)) return false;
  if (typeof config.updatedAt !== 'string') return false;
  return true;
}

/** A fresh account config: default interval + all types active. */
export function defaultNotificationAccountConfig(
  accountId: AccountId,
  updatedAt: ISODateTime = '2026-06-07T00:00:00.000Z',
): NotificationAccountConfig {
  return {
    accountId,
    intervalDays: DEFAULT_NOTIFICATION_INTERVAL_DAYS,
    activeTypes: [...NOTIFICATION_TYPES],
    updatedAt,
  };
}

/** A fresh member consent record: opt-in default OFF. */
export function defaultNotificationMemberConsent(
  accountId: AccountId,
  userId: UserId,
  updatedAt: ISODateTime = '2026-06-07T00:00:00.000Z',
): NotificationMemberConsent {
  return { accountId, userId, receiveConsent: false, updatedAt };
}

// ---------------------------------------------------------------------------
// Role-conditional visibility model (two independent axes)
// ---------------------------------------------------------------------------

/**
 * The viewing user's role/entitlement for the active account, projected to the
 * inputs the visibility resolvers need. `accountRole` is the user's role on the
 * ACTIVE account (or `null` if they hold no membership on it). `isSiteAdmin`
 * and `isAppAdmin` are the supervisory group-derived flags.
 */
export interface NotificationViewerContext {
  accountRole: AccountRole | null;
  isSiteAdmin: boolean;
  isAppAdmin: boolean;
}

/** Per-control visibility outcome. */
export type ControlVisibility = 'editable' | 'read-only' | 'hidden';

/** Per-control visibility for the whole notification card. */
export interface NotificationVisibility {
  intervalDays: ControlVisibility;
  typeSelection: ControlVisibility;
  receiveConsent: ControlVisibility;
  /**
   * App-wide notification engine kill-switch (M19 #571). Applicable to
   * owner/manager + supervisory admins; editable for site/app-admin only,
   * read-only for owner/manager, hidden for member/viewer.
   */
  engineToggle: ControlVisibility;
  /**
   * Convenience: true when EVERY notification control is hidden (a viewer / a
   * non-member non-admin), meaning the entire notification feature is
   * inapplicable and the card should not render at all.
   */
  allHidden: boolean;
}

/**
 * AXIS 1 — APPLICABILITY. Could this user EVER be subject to notifications
 * (i.e. are they entitled to the feature at all), independent of whether
 * delivery is currently on? A user is applicable when they have write access to
 * the account (owner/manager/member — `viewer` is read-only and can never
 * receive), OR they are a supervisory admin (site-admin / app-admin), who see
 * everything. A pure `viewer` with no admin authority is NOT applicable.
 */
export function isNotificationFeatureApplicable(ctx: NotificationViewerContext): boolean {
  if (ctx.isSiteAdmin || ctx.isAppAdmin) return true;
  return (
    ctx.accountRole === 'owner' ||
    ctx.accountRole === 'manager' ||
    ctx.accountRole === 'member'
  );
}

/**
 * AXIS 2 — ENTITLEMENT for ACCOUNT-level config (intervalDays, typeSelection).
 * Editable for owners/managers and supervisory admins; a plain member sees it
 * read-only (applicable, but not entitled to edit).
 */
function isEntitledToEditAccountConfig(ctx: NotificationViewerContext): boolean {
  return (
    ctx.isSiteAdmin ||
    ctx.isAppAdmin ||
    ctx.accountRole === 'owner' ||
    ctx.accountRole === 'manager'
  );
}

/** Visibility for an ACCOUNT-level control (intervalDays / typeSelection share one rule). */
export function resolveAccountConfigVisibility(ctx: NotificationViewerContext): ControlVisibility {
  if (!isNotificationFeatureApplicable(ctx)) return 'hidden';
  return isEntitledToEditAccountConfig(ctx) ? 'editable' : 'read-only';
}

/**
 * Visibility for the PER-MEMBER receiveConsent control. Anyone to whom the
 * feature is applicable controls their OWN consent (always editable when
 * shown); a viewer (inapplicable) sees nothing.
 */
export function resolveReceiveConsentVisibility(ctx: NotificationViewerContext): ControlVisibility {
  return isNotificationFeatureApplicable(ctx) ? 'editable' : 'hidden';
}

/**
 * Visibility for the APP-WIDE notification engine kill-switch (M19 #571).
 *
 * Distinct entitlement from account-config: this is a PLATFORM control, so only
 * supervisory admins (site-admin / SA app-admin) may EDIT it. Owners/managers
 * SEE it READ-ONLY (it affects their account's sends, so it's applicable to
 * them), but cannot flip a platform-wide switch. Members/viewers: HIDDEN.
 *
 *   | Owner/Manager | Plain member | Viewer | App/Site admin |
 *   | read-only     | HIDDEN       | HIDDEN | editable        |
 */
export function resolveEngineToggleVisibility(ctx: NotificationViewerContext): ControlVisibility {
  if (ctx.isSiteAdmin || ctx.isAppAdmin) return 'editable';
  if (ctx.accountRole === 'owner' || ctx.accountRole === 'manager') return 'read-only';
  return 'hidden';
}

/** Resolve visibility for every notification control at once. */
export function resolveNotificationVisibility(ctx: NotificationViewerContext): NotificationVisibility {
  const accountConfig = resolveAccountConfigVisibility(ctx);
  const receiveConsent = resolveReceiveConsentVisibility(ctx);
  const engineToggle = resolveEngineToggleVisibility(ctx);
  return {
    intervalDays: accountConfig,
    typeSelection: accountConfig,
    receiveConsent,
    engineToggle,
    allHidden:
      accountConfig === 'hidden' && receiveConsent === 'hidden' && engineToggle === 'hidden',
  };
}
