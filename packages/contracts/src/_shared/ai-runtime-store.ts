import {
  AI_CONFIG_PK,
  PLATFORM_DEFAULT_SK,
  exampleAiRuntimeConfigResponse,
  type AiConfigAppSlug,
  type AiRuntimeConfigRecord,
  type AiRuntimeConfigUpdate,
} from './ai-runtime';

/**
 * Shared in-memory AI runtime config store (M15.1 mock authority).
 *
 * This is the single mock "server" source of truth that all three surfaces
 * read from, so they stay consistent without a live API:
 *
 *  - Launchpad OWNS the platform-default slot (read/write) and READS every
 *    app override slot to render its read-only "Effective App Settings".
 *  - Each app OWNS its own override slot (read/write) and READS the
 *    platform-default slot to display the value it inherits.
 *
 * No surface writes a slot it does not own. Provider credentials never live
 * here — only provider/model identifiers.
 */

const seededPlatformDefault: AiRuntimeConfigRecord | null =
  exampleAiRuntimeConfigResponse.platformDefault;

interface AiRuntimeStoreState {
  platformDefault: AiRuntimeConfigRecord | null;
  appOverrides: Record<AiConfigAppSlug, AiRuntimeConfigRecord | null>;
}

/**
 * The three surfaces live on separate routes, so a plain module singleton would
 * reset on full-page navigation. We persist the mock "server" state in
 * sessionStorage so a saved override survives navigating between Launchpad and
 * each app within the same tab/session. This is mock-server persistence (not
 * app data storage) and carries provider/model identifiers only — never secrets.
 */
const STORAGE_KEY = 'transformotion.mock.ai-runtime-store.v1';

function defaultState(): AiRuntimeStoreState {
  return {
    platformDefault: seededPlatformDefault,
    appOverrides: {
      'stock-analyser': null,
      'budget-tracker': null,
    },
  };
}

function loadState(): AiRuntimeStoreState {
  if (typeof window === 'undefined') return defaultState();
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw) as Partial<AiRuntimeStoreState>;
    const base = defaultState();
    return {
      platformDefault: parsed.platformDefault ?? base.platformDefault,
      appOverrides: {
        ...base.appOverrides,
        ...(parsed.appOverrides ?? {}),
      },
    };
  } catch {
    return defaultState();
  }
}

// In-memory state is authoritative within a single page/route. It is seeded
// from storage at module init so a fresh route picks up writes made elsewhere.
const state: AiRuntimeStoreState = loadState();

function persist(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Best-effort mock persistence; ignore quota/availability errors.
  }
}

/**
 * Read the current cross-route snapshot.
 *
 * Storage may hold newer values written by another route, so we prefer a stored
 * slot when present but fall back to the authoritative in-memory value when
 * storage is empty or unavailable (e.g. blocked in a sandboxed preview iframe).
 * This keeps same-page saves working even when persistence is blocked, while
 * still syncing across routes when it is available.
 */
function readState(): AiRuntimeStoreState {
  const stored = loadState();
  return {
    platformDefault: stored.platformDefault ?? state.platformDefault,
    appOverrides: {
      'stock-analyser': stored.appOverrides['stock-analyser'] ?? state.appOverrides['stock-analyser'],
      'budget-tracker': stored.appOverrides['budget-tracker'] ?? state.appOverrides['budget-tracker'],
    },
  };
}

function nowIso(): string {
  return new Date().toISOString();
}

// --- Platform default (owned by Launchpad) ------------------------------

export function getPlatformDefault(): AiRuntimeConfigRecord | null {
  return readState().platformDefault;
}

export function setPlatformDefault(update: AiRuntimeConfigUpdate): AiRuntimeConfigRecord {
  state.platformDefault = {
    pk: AI_CONFIG_PK,
    sk: PLATFORM_DEFAULT_SK,
    provider: update.provider,
    model: update.model,
    updatedAt: nowIso(),
  };
  persist();
  return state.platformDefault;
}

// --- App overrides (each owned by its own app) --------------------------

export function getAppOverride(appSlug: AiConfigAppSlug): AiRuntimeConfigRecord | null {
  return readState().appOverrides[appSlug];
}

export function getAllAppOverrides(): Record<AiConfigAppSlug, AiRuntimeConfigRecord | null> {
  return readState().appOverrides;
}

export function setAppOverride(
  appSlug: AiConfigAppSlug,
  update: AiRuntimeConfigUpdate,
): AiRuntimeConfigRecord {
  const record: AiRuntimeConfigRecord = {
    pk: AI_CONFIG_PK,
    sk: `APP#${appSlug}`,
    provider: update.provider,
    model: update.model,
    updatedAt: nowIso(),
  };
  state.appOverrides[appSlug] = record;
  persist();
  return record;
}

export function resetAppOverride(appSlug: AiConfigAppSlug): null {
  state.appOverrides[appSlug] = null;
  persist();
  return null;
}
