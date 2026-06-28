import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DeleteCommand, DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import {
  badRequest,
  noContent,
  ok,
  parseBody,
  requireAccountAdmin,
  requireAccountData,
  requireAccountOwnerOrManager,
  requireAppAdminForApp,
  requireSiteAdmin,
  withAuth,
  type APIGatewayProxyEvent,
  type MembershipLoader,
} from '@transformotion/lambda-middleware';
import { dynamoMembershipLoader } from '@transformotion/fn-account-membership';
import {
  AI_CONFIG_PK,
  AI_MODEL_ALLOWLIST,
  PLATFORM_DEFAULT_SK,
  appOverrideSk,
  assertValidAiConfig,
  isSupportedAiModel,
  isSupportedAiProvider,
  resolveEnvFallbackConfig,
  type AiRuntimeConfigRecord,
  type AppAiRuntimeConfigResponse,
} from '@transformotion/fn-ai-proxy-core';
import type { StockAnalyserSettings } from '@transformotion/contracts/stock-analyser/types';
import type {
  PatchSettingsRequest,
  PutCacheFreshnessConfigRequest,
} from '@transformotion/contracts/stock-analyser/api';
import {
  defaultCacheFreshnessConfigRecord,
  isValidCacheFreshnessPolicy,
  isValidCacheFreshnessPreset,
  type CacheFreshnessConfigRecord,
} from '@transformotion/contracts/stock-analyser/cache-freshness';
import {
  NOTIFICATION_TYPES,
  defaultNotificationAccountConfig,
  defaultNotificationEngineConfig,
  defaultNotificationMemberConsent,
  isValidNotificationAccountConfig,
  normalizeIntervalDays,
  type NotificationAccountConfig,
  type NotificationEngineConfig,
  type NotificationMemberConsent,
  type NotificationType,
} from '@transformotion/contracts/stock-analyser/notification-preferences';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const SETTINGS_TABLE = process.env.SETTINGS_TABLE!;
const PLATFORM_CONFIG_TABLE = process.env.PLATFORM_CONFIG_TABLE!;
const ACCOUNT_MEMBERS_TABLE = process.env.ACCOUNT_MEMBERS_TABLE!;
const APP_SLUG = 'stock-analyser' as const;

interface Dependencies {
  client: DynamoDBDocumentClient;
  settingsTable: string;
  platformConfigTable: string;
  /** Live membership-row loader for D8 control-plane authz (notification writes). */
  membershipLoader: MembershipLoader;
  now: () => Date;
}

const defaultDependencies: Dependencies = {
  client: ddb,
  settingsTable: SETTINGS_TABLE,
  platformConfigTable: PLATFORM_CONFIG_TABLE,
  membershipLoader: dynamoMembershipLoader(ddb, ACCOUNT_MEMBERS_TABLE),
  now: () => new Date(),
};

interface UpdateConfigBody {
  provider: unknown;
  model: unknown;
}

function accountPk(accountId: string) {
  return `ACCOUNT#${accountId}`;
}

function userPreferencesSk(userId: string) {
  return `USER#${userId}#PREFERENCES`;
}

const cacheFreshnessKey = {
  pk: 'SETTINGS',
  sk: 'CACHE_FRESHNESS#stock-analyser',
} as const;

function parseAiUpdateBody(event: APIGatewayProxyEvent) {
  const body = parseBody<UpdateConfigBody & Record<string, unknown>>(event);
  const unexpected = Object.keys(body).filter(key => key !== 'provider' && key !== 'model');
  if (unexpected.length) {
    throw badRequest(`Unsupported AI config fields: ${unexpected.join(', ')}`);
  }

  try {
    assertValidAiConfig(body.provider, body.model);
  } catch (err) {
    throw badRequest(err instanceof Error ? err.message : 'Invalid AI provider/model config');
  }

  return { provider: body.provider, model: body.model as string };
}

function parseRecord(item: Record<string, unknown> | undefined): AiRuntimeConfigRecord | null {
  if (!item) return null;
  const source = typeof item['config'] === 'object' && item['config'] !== null
    ? item['config'] as Record<string, unknown>
    : item;
  const provider = source['provider'];
  const model = source['model'];
  const updatedAt = source['updatedAt'];
  const sk = source['sk'];
  if (
    !isSupportedAiProvider(provider) ||
    !isSupportedAiModel(provider, model) ||
    typeof updatedAt !== 'string' ||
    sk !== appOverrideSk(APP_SLUG) && sk !== PLATFORM_DEFAULT_SK
  ) {
    return null;
  }
  return { pk: AI_CONFIG_PK, sk, provider, model, updatedAt };
}

function parseCacheFreshnessConfig(
  item: Record<string, unknown> | undefined,
  now: Date,
): CacheFreshnessConfigRecord {
  if (!item) return defaultCacheFreshnessConfigRecord(now.toISOString());
  const activePolicy = item['activePolicy'];
  const presets = item['presets'];
  const updatedAt = item['updatedAt'];
  if (
    !isValidCacheFreshnessPolicy(activePolicy) ||
    !Array.isArray(presets) ||
    !presets.every(isValidCacheFreshnessPreset) ||
    typeof updatedAt !== 'string'
  ) {
    return defaultCacheFreshnessConfigRecord(now.toISOString());
  }
  return {
    ...cacheFreshnessKey,
    activePolicy,
    presets,
    updatedAt,
  };
}

async function readPlatformDefault(deps: Dependencies): Promise<AiRuntimeConfigRecord | null> {
  const res = await deps.client.send(new GetCommand({
    TableName: deps.platformConfigTable,
    Key: { pk: AI_CONFIG_PK, sk: PLATFORM_DEFAULT_SK },
  }));
  return parseRecord(res.Item);
}

// #586: the AI Engine override is APP-LEVEL — one record at {AI_CONFIG,
// APP#stock-analyser} read by BOTH the live app (ai-proxy) and the batch job
// (notification engine), in the top-level shape the resolver expects. (Was
// per-account {ACCOUNT#…, APP#AI_RUNTIME}, which the batch never read.)
async function readAppOverride(deps: Dependencies): Promise<AiRuntimeConfigRecord | null> {
  const res = await deps.client.send(new GetCommand({
    TableName: deps.settingsTable,
    Key: { pk: AI_CONFIG_PK, sk: appOverrideSk(APP_SLUG) },
  }));
  return parseRecord(res.Item);
}

function aiConfigResponse(
  platformDefault: AiRuntimeConfigRecord | null,
  appOverride: AiRuntimeConfigRecord | null,
): AppAiRuntimeConfigResponse {
  return {
    appSlug: APP_SLUG,
    platformDefault,
    appOverride,
    effective: appOverride
      ? { provider: appOverride.provider, model: appOverride.model, source: 'app_override' }
      : platformDefault
        ? { provider: platformDefault.provider, model: platformDefault.model, source: 'platform_default' }
        : resolveEnvFallbackConfig({ fallbackProvider: 'claude', fallbackModel: 'claude-sonnet-4-6' }),
    supportedModels: AI_MODEL_ALLOWLIST,
  };
}

async function readSettings(deps: Dependencies, accountId: string, userId: string) {
  const res = await deps.client.send(new GetCommand({
    TableName: deps.settingsTable,
    Key: { pk: accountPk(accountId), sk: userPreferencesSk(userId) },
  }));
  const explanatoryTextEnabled = typeof res.Item?.['explanatoryTextEnabled'] === 'boolean'
    ? res.Item['explanatoryTextEnabled'] as boolean
    : true;
  const defaultSearchMode = res.Item?.['defaultSearchMode'] === 'fast' || res.Item?.['defaultSearchMode'] === 'live'
    ? res.Item['defaultSearchMode'] as StockAnalyserSettings['defaultSearchMode']
    : 'live';
  const updatedAt = typeof res.Item?.['updatedAt'] === 'string'
    ? res.Item['updatedAt'] as string
    : deps.now().toISOString();
  const settings: StockAnalyserSettings = {
    pk: 'SETTINGS',
    sk: 'APP#stock-analyser',
    explanatoryTextEnabled,
    defaultSearchMode,
    updatedAt,
  };
  return ok({ settings });
}

async function patchSettings(deps: Dependencies, event: APIGatewayProxyEvent, accountId: string, userId: string) {
  const body = parseBody<PatchSettingsRequest & Record<string, unknown>>(event);
  const unexpected = Object.keys(body).filter(key => key !== 'explanatoryTextEnabled' && key !== 'defaultSearchMode');
  if (unexpected.length) {
    throw badRequest(`Unsupported settings fields: ${unexpected.join(', ')}`);
  }
  if (body.explanatoryTextEnabled !== undefined && typeof body.explanatoryTextEnabled !== 'boolean') {
    throw badRequest('explanatoryTextEnabled must be a boolean');
  }
  if (
    body.defaultSearchMode !== undefined &&
    body.defaultSearchMode !== 'fast' &&
    body.defaultSearchMode !== 'live'
  ) {
    throw badRequest('defaultSearchMode must be "live" or "fast"');
  }
  if (body.explanatoryTextEnabled === undefined && body.defaultSearchMode === undefined) {
    throw badRequest('At least one supported settings field is required');
  }

  const existing = await deps.client.send(new GetCommand({
    TableName: deps.settingsTable,
    Key: { pk: accountPk(accountId), sk: userPreferencesSk(userId) },
  }));
  const explanatoryTextEnabled = body.explanatoryTextEnabled ?? (
    typeof existing.Item?.['explanatoryTextEnabled'] === 'boolean'
      ? existing.Item['explanatoryTextEnabled'] as boolean
      : true
  );
  const defaultSearchMode = body.defaultSearchMode ?? (
    existing.Item?.['defaultSearchMode'] === 'fast' || existing.Item?.['defaultSearchMode'] === 'live'
      ? existing.Item['defaultSearchMode'] as StockAnalyserSettings['defaultSearchMode']
      : 'live'
  );
  const updatedAt = deps.now().toISOString();
  await deps.client.send(new PutCommand({
    TableName: deps.settingsTable,
    Item: {
      pk: accountPk(accountId),
      sk: userPreferencesSk(userId),
      explanatoryTextEnabled,
      defaultSearchMode,
      updatedAt,
    },
  }));
  const settings: StockAnalyserSettings = {
    pk: 'SETTINGS',
    sk: 'APP#stock-analyser',
    explanatoryTextEnabled,
    defaultSearchMode,
    updatedAt,
  };
  return ok({ settings });
}

async function readAiConfig(deps: Dependencies) {
  const [platformDefault, appOverride] = await Promise.all([
    readPlatformDefault(deps),
    readAppOverride(deps),
  ]);
  return ok(aiConfigResponse(platformDefault, appOverride));
}

async function readCacheFreshnessConfig(deps: Dependencies) {
  const res = await deps.client.send(new GetCommand({
    TableName: deps.settingsTable,
    Key: cacheFreshnessKey,
  }));
  return ok({ config: parseCacheFreshnessConfig(res.Item, deps.now()) });
}

function requireCacheFreshnessAdmin(auth: Parameters<typeof requireSiteAdmin>[0]) {
  if (auth.siteAdmin) {
    requireSiteAdmin(auth);
    return;
  }
  requireAppAdminForApp(auth, APP_SLUG);
}

// ── #571 notification engine kill-switch (app-wide) ──────────────────────────
const notificationEngineConfigKey = {
  pk: 'SETTINGS',
  sk: 'NOTIFICATION_ENGINE_CONFIG#stock-analyser',
} as const;

function parseNotificationEngineConfig(
  item: Record<string, unknown> | undefined,
  now: Date,
): NotificationEngineConfig {
  if (!item) return defaultNotificationEngineConfig(now.toISOString());
  const enabled = item['notificationsEnabled'];
  const updatedAt = item['updatedAt'];
  if (typeof enabled !== 'boolean' || typeof updatedAt !== 'string') {
    return defaultNotificationEngineConfig(now.toISOString());
  }
  return { notificationsEnabled: enabled, updatedAt };
}

/**
 * #571 PIECE 3 — WRITE authz for the engine kill-switch: SITE or SA APP-ADMIN
 * only, server-enforced + fail-closed. The read-only/hidden UI is UX; this is
 * the boundary — an owner/manager/member/viewer write is rejected even if the
 * request is crafted directly past the UI. (Same site-OR-app-admin gate as the
 * cache-freshness app-wide config.)
 */
function requireNotificationEngineAdmin(auth: Parameters<typeof requireSiteAdmin>[0]) {
  if (auth.siteAdmin) {
    requireSiteAdmin(auth);
    return;
  }
  requireAppAdminForApp(auth, APP_SLUG);
}

async function readNotificationEngineConfig(deps: Dependencies) {
  const res = await deps.client.send(new GetCommand({
    TableName: deps.settingsTable,
    Key: notificationEngineConfigKey,
  }));
  return ok({ config: parseNotificationEngineConfig(res.Item, deps.now()) });
}

async function updateNotificationEngineConfig(deps: Dependencies, event: APIGatewayProxyEvent) {
  const body = parseBody<{ notificationsEnabled?: unknown } & Record<string, unknown>>(event);
  const unexpected = Object.keys(body).filter(key => key !== 'notificationsEnabled');
  if (unexpected.length) throw badRequest(`Unsupported engine config fields: ${unexpected.join(', ')}`);
  if (typeof body.notificationsEnabled !== 'boolean') {
    throw badRequest('notificationsEnabled (boolean) is required');
  }
  const config: NotificationEngineConfig = {
    notificationsEnabled: body.notificationsEnabled,
    updatedAt: deps.now().toISOString(),
  };
  await deps.client.send(new PutCommand({
    TableName: deps.settingsTable,
    Item: { ...notificationEngineConfigKey, ...config },
  }));
  return ok({ config });
}

async function updateCacheFreshnessConfig(deps: Dependencies, event: APIGatewayProxyEvent) {
  const body = parseBody<PutCacheFreshnessConfigRequest & Record<string, unknown>>(event);
  const unexpected = Object.keys(body).filter(key => key !== 'activePolicy' && key !== 'presets');
  if (unexpected.length) {
    throw badRequest(`Unsupported cache freshness fields: ${unexpected.join(', ')}`);
  }
  if (body.activePolicy !== undefined && !isValidCacheFreshnessPolicy(body.activePolicy)) {
    throw badRequest('Invalid cache freshness policy');
  }
  if (
    body.presets !== undefined &&
    (!Array.isArray(body.presets) || !body.presets.every(isValidCacheFreshnessPreset))
  ) {
    throw badRequest('Invalid cache freshness presets');
  }
  if (body.activePolicy === undefined && body.presets === undefined) {
    throw badRequest('At least one cache freshness field is required');
  }

  const existing = await deps.client.send(new GetCommand({
    TableName: deps.settingsTable,
    Key: cacheFreshnessKey,
  }));
  const previous = parseCacheFreshnessConfig(existing.Item, deps.now());
  const updatedAt = deps.now().toISOString();
  const config: CacheFreshnessConfigRecord = {
    ...cacheFreshnessKey,
    activePolicy: body.activePolicy ?? previous.activePolicy,
    presets: body.presets ?? previous.presets,
    updatedAt,
  };

  await deps.client.send(new PutCommand({
    TableName: deps.settingsTable,
    Item: config,
  }));
  return ok({ config });
}

async function updateOverride(deps: Dependencies, event: APIGatewayProxyEvent) {
  const { provider, model } = parseAiUpdateBody(event);
  // #586: write ONE app-level record, TOP-LEVEL shape (provider/model on the
  // item, not nested under `config`) so the engine's resolver reads it directly.
  const appOverride: AiRuntimeConfigRecord = {
    pk: AI_CONFIG_PK,
    sk: appOverrideSk(APP_SLUG),
    provider,
    model,
    updatedAt: deps.now().toISOString(),
  };
  await deps.client.send(new PutCommand({
    TableName: deps.settingsTable,
    Item: appOverride,
  }));
  const platformDefault = await readPlatformDefault(deps);
  return ok(aiConfigResponse(platformDefault, appOverride));
}

async function resetOverride(deps: Dependencies) {
  await deps.client.send(new DeleteCommand({
    TableName: deps.settingsTable,
    Key: { pk: AI_CONFIG_PK, sk: appOverrideSk(APP_SLUG) },
  }));
  return noContent();
}

// ── Notification preferences (M19 #534) ─────────────────────────────────────
// Canonical key shapes (per contracts/stock-analyser/notification-preferences.ts):
//   account config: pk 'SETTINGS', sk 'NOTIFICATIONS#${accountId}'   (owner/manager-controlled)
//   member consent: pk 'NOTIFICATION_CONSENT#${accountId}', sk 'USER#${userId}'  (own record, default OFF)
const notificationConfigKey = (accountId: string) => ({ pk: 'SETTINGS', sk: `NOTIFICATIONS#${accountId}` });
const notificationConsentKey = (accountId: string, userId: string) => ({
  pk: `NOTIFICATION_CONSENT#${accountId}`,
  sk: `USER#${userId}`,
});

function parseNotificationConfig(
  item: Record<string, unknown> | undefined,
  accountId: string,
  now: Date,
): NotificationAccountConfig {
  const candidate = item
    ? { accountId, intervalDays: item['intervalDays'], activeTypes: item['activeTypes'], updatedAt: item['updatedAt'] }
    : undefined;
  if (isValidNotificationAccountConfig(candidate)) return candidate;
  return defaultNotificationAccountConfig(accountId, now.toISOString());
}

async function readNotificationConfig(deps: Dependencies, accountId: string) {
  const res = await deps.client.send(new GetCommand({
    TableName: deps.settingsTable,
    Key: notificationConfigKey(accountId),
  }));
  return ok({ config: parseNotificationConfig(res.Item, accountId, deps.now()) });
}

async function updateNotificationConfig(deps: Dependencies, event: APIGatewayProxyEvent, accountId: string) {
  const body = parseBody<{ intervalDays?: unknown; activeTypes?: unknown } & Record<string, unknown>>(event);
  const unexpected = Object.keys(body).filter(key => key !== 'intervalDays' && key !== 'activeTypes');
  if (unexpected.length) {
    throw badRequest(`Unsupported notification config fields: ${unexpected.join(', ')}`);
  }
  if (body.intervalDays !== undefined && typeof body.intervalDays !== 'number') {
    throw badRequest('intervalDays must be a number');
  }
  if (body.activeTypes !== undefined && !Array.isArray(body.activeTypes)) {
    throw badRequest('activeTypes must be an array');
  }
  if (body.intervalDays === undefined && body.activeTypes === undefined) {
    throw badRequest('At least one notification config field is required');
  }

  const existing = await deps.client.send(new GetCommand({
    TableName: deps.settingsTable,
    Key: notificationConfigKey(accountId),
  }));
  const previous = parseNotificationConfig(existing.Item, accountId, deps.now());

  // intervalDays floored at the contract minimum; activeTypes filtered + deduped to
  // the allowed set in canonical order — server never trusts the request shape.
  const intervalDays = body.intervalDays !== undefined
    ? normalizeIntervalDays(body.intervalDays)
    : previous.intervalDays;
  const activeTypes: NotificationType[] = body.activeTypes !== undefined
    ? NOTIFICATION_TYPES.filter(t => (body.activeTypes as unknown[]).includes(t))
    : previous.activeTypes;

  const updatedAt = deps.now().toISOString();
  const config: NotificationAccountConfig = { accountId, intervalDays, activeTypes, updatedAt };
  await deps.client.send(new PutCommand({
    TableName: deps.settingsTable,
    Item: { ...notificationConfigKey(accountId), ...config },
  }));
  return ok({ config });
}

function parseNotificationConsent(
  item: Record<string, unknown> | undefined,
  accountId: string,
  userId: string,
  now: Date,
): NotificationMemberConsent {
  if (typeof item?.['receiveConsent'] === 'boolean' && typeof item['updatedAt'] === 'string') {
    return { accountId, userId, receiveConsent: item['receiveConsent'], updatedAt: item['updatedAt'] };
  }
  return defaultNotificationMemberConsent(accountId, userId, now.toISOString());
}

async function readNotificationConsent(deps: Dependencies, accountId: string, userId: string) {
  const res = await deps.client.send(new GetCommand({
    TableName: deps.settingsTable,
    Key: notificationConsentKey(accountId, userId),
  }));
  return ok({ consent: parseNotificationConsent(res.Item, accountId, userId, deps.now()) });
}

async function updateNotificationConsent(
  deps: Dependencies,
  event: APIGatewayProxyEvent,
  accountId: string,
  userId: string,
) {
  const body = parseBody<{ receiveConsent?: unknown } & Record<string, unknown>>(event);
  if (typeof body.receiveConsent !== 'boolean') {
    throw badRequest('receiveConsent must be a boolean');
  }
  // Keyed by the AUTHENTICATED userId — never a body field. A member can only
  // ever write their OWN consent record by construction (any body userId is ignored).
  const updatedAt = deps.now().toISOString();
  const consent: NotificationMemberConsent = { accountId, userId, receiveConsent: body.receiveConsent, updatedAt };
  await deps.client.send(new PutCommand({
    TableName: deps.settingsTable,
    Item: { ...notificationConsentKey(accountId, userId), ...consent },
  }));
  return ok({ consent });
}

/**
 * Account-config writes (intervalDays / activeTypes) are CONTROL-PLANE (M19 #534):
 * owner/manager via the D8 live membership-row read, OR supervisory admin. Fail
 * closed (loader throw → 503; member/viewer → 403). The card's role-conditional
 * render is UX only — this is the enforcement, independent of what rendered.
 */
async function requireNotificationAccountConfigWrite(
  deps: Dependencies,
  auth: Parameters<typeof requireSiteAdmin>[0],
  accountId: string,
  userId: string,
): Promise<void> {
  await requireAccountAdmin(
    () => requireAccountOwnerOrManager(deps.membershipLoader, accountId, userId),
    async () => { requireAppAdminForApp(auth, APP_SLUG); },
    async () => { requireSiteAdmin(auth); },
  );
}

// D9 data-tier gate (no site-admin branch). Settings rows are D12 user-scoped
// (SK=USER#{userId}#PREFERENCES): a viewer MAY read AND write their OWN prefs,
// so both /settings GET and PATCH use .read (membership) — the handler keys by
// auth.userId, enforcing the SK-owner match by construction.
const saData = requireAccountData(APP_SLUG);

export function createHandler(deps: Dependencies = defaultDependencies) {
  return withAuth(async ({ auth, account, event }) => {
    const resource = event.resource ?? '';
    if (resource === '/settings' && event.httpMethod === 'GET') {
      saData.read(auth, account.accountId);
      return readSettings(deps, account.accountId, auth.userId);
    }
    if (resource === '/settings' && event.httpMethod === 'PATCH') {
      saData.read(auth, account.accountId); // D12 user-scoped own-prefs write — viewer permitted
      return patchSettings(deps, event, account.accountId, auth.userId);
    }
    if (resource === '/ai-config' && event.httpMethod === 'GET') {
      saData.read(auth, account.accountId);
      return readAiConfig(deps);
    }
    if (resource === '/cache-freshness' && event.httpMethod === 'GET') {
      saData.read(auth, account.accountId);
      return readCacheFreshnessConfig(deps);
    }
    if (resource === '/cache-freshness' && event.httpMethod === 'PUT') {
      saData.read(auth, account.accountId);
      requireCacheFreshnessAdmin(auth);
      return updateCacheFreshnessConfig(deps, event);
    }
    // /ai-config/override is APP-LEVEL operational config (#586): one record at
    // {AI_CONFIG, APP#stock-analyser} governing the whole app (live + batch),
    // site-admin write. (saData.read still establishes the account context for
    // the D9 read gate; the override itself is no longer per-account.)
    if (resource === '/ai-config/override' && event.httpMethod === 'PUT') {
      saData.read(auth, account.accountId);
      requireSiteAdmin(auth);
      return updateOverride(deps, event);
    }
    if (resource === '/ai-config/override' && event.httpMethod === 'DELETE') {
      saData.read(auth, account.accountId);
      requireSiteAdmin(auth);
      return resetOverride(deps);
    }

    // ── Notification engine kill-switch (M19 #571, app-wide) ─────────────────
    // GET: any member may read (the card resolves toggle visibility per role).
    if (resource === '/notification-engine-config' && event.httpMethod === 'GET') {
      saData.read(auth, account.accountId);
      return readNotificationEngineConfig(deps);
    }
    // PUT: SITE or SA APP-ADMIN only (Piece 3) — fail-closed past the UI.
    if (resource === '/notification-engine-config' && event.httpMethod === 'PUT') {
      saData.read(auth, account.accountId);
      requireNotificationEngineAdmin(auth);
      return updateNotificationEngineConfig(deps, event);
    }

    // ── Notification preferences (M19 #534) ──────────────────────────────────
    // GET account config: any member may read (the card decides visibility).
    if (resource === '/notification-config' && event.httpMethod === 'GET') {
      saData.read(auth, account.accountId);
      return readNotificationConfig(deps, account.accountId);
    }
    // PUT account config: owner/manager (D8 control-plane) or supervisory admin.
    // FAIL CLOSED — rejects a member/viewer write even past the disabled UI.
    if (resource === '/notification-config' && event.httpMethod === 'PUT') {
      saData.read(auth, account.accountId);
      await requireNotificationAccountConfigWrite(deps, auth, account.accountId, auth.userId);
      return updateNotificationConfig(deps, event, account.accountId);
    }
    // GET own consent: keyed by the authenticated userId.
    if (resource === '/notification-consent' && event.httpMethod === 'GET') {
      saData.read(auth, account.accountId);
      return readNotificationConsent(deps, account.accountId, auth.userId);
    }
    // PUT own consent: D8 write tier (claims + live membership row) → rejects
    // viewer/disabled/missing; the record is keyed by auth.userId, so a member
    // can never write another member's consent (own-record-only by construction).
    if (resource === '/notification-consent' && event.httpMethod === 'PUT') {
      await saData.write(auth, account.accountId, deps.membershipLoader);
      return updateNotificationConsent(deps, event, account.accountId, auth.userId);
    }

    throw badRequest(`Unrecognised route: ${event.httpMethod} ${resource}`);
  });
}

export const handler = createHandler();
