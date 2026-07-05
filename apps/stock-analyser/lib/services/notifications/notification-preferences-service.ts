/**
 * Notification-preferences service (M19 #534).
 *
 * Mock-vs-live, switched on the storage profile — mirrors settings-service. The
 * LIVE path goes through the settings Lambda, where authorization is enforced
 * server-side (owner/manager for account config; own-record-only for consent).
 * This client-side service is plumbing only; it is NOT the access boundary.
 */
import { getConfig } from '@/lib/config'
import { stockAnalyserClient } from '@/lib/api'
import {
  NOTIFICATION_TYPES,
  defaultNotificationAccountConfig,
  defaultNotificationEngineConfig,
  defaultNotificationMemberConsent,
  normalizeIntervalDays,
  type NotificationAccountConfig,
  type NotificationEngineConfig,
  type NotificationMemberConsent,
  type NotificationType,
  type WarmSurfaces,
} from '@transformotion/contracts/stock-analyser/notification-preferences'
import type {
  NotificationRunHistoryView,
  NotificationRunView,
} from '@transformotion/contracts/stock-analyser/notification-run-history'

export interface NotificationPreferencesService {
  getConfig(accountId: string): Promise<NotificationAccountConfig>
  putConfig(
    accountId: string,
    body: { intervalDays?: number; activeTypes?: NotificationType[] },
  ): Promise<NotificationAccountConfig>
  getConsent(accountId: string): Promise<NotificationMemberConsent>
  putConsent(accountId: string, receiveConsent: boolean): Promise<NotificationMemberConsent>
  // App-wide engine kill-switch (M19 #571) + per-surface warm gates (M19) — a single
  // global record, account-independent. `warmSurfaces` omitted ⇒ server preserves the
  // stored map (read-merge); present ⇒ replaces it.
  getEngineConfig(): Promise<NotificationEngineConfig>
  setEngineConfig(body: { notificationsEnabled: boolean; warmSurfaces?: WarmSurfaces }): Promise<NotificationEngineConfig>
  // Run-history (M19 #573) — the response is ALREADY projected per viewer server-side.
  getRunHistory(): Promise<NotificationRunHistoryView>
}

// ── Mock (local dev) — in-memory, single implicit user ──────────────────────────
const mockConfigs = new Map<string, NotificationAccountConfig>()
const mockConsents = new Map<string, NotificationMemberConsent>()
const MOCK_USER = 'user-local'
// App-wide kill-switch — single global record (default ON), account-independent.
let mockEngine: NotificationEngineConfig = defaultNotificationEngineConfig()

const mockService: NotificationPreferencesService = {
  async getConfig(accountId) {
    return mockConfigs.get(accountId) ?? defaultNotificationAccountConfig(accountId)
  },
  async putConfig(accountId, body) {
    const prev = mockConfigs.get(accountId) ?? defaultNotificationAccountConfig(accountId)
    const next: NotificationAccountConfig = {
      accountId,
      intervalDays: body.intervalDays !== undefined ? normalizeIntervalDays(body.intervalDays) : prev.intervalDays,
      activeTypes: body.activeTypes !== undefined
        ? NOTIFICATION_TYPES.filter(t => body.activeTypes!.includes(t))
        : prev.activeTypes,
      updatedAt: new Date().toISOString(),
    }
    mockConfigs.set(accountId, next)
    return next
  },
  async getConsent(accountId) {
    return mockConsents.get(accountId) ?? defaultNotificationMemberConsent(accountId, MOCK_USER)
  },
  async putConsent(accountId, receiveConsent) {
    const next: NotificationMemberConsent = {
      accountId,
      userId: MOCK_USER,
      receiveConsent,
      updatedAt: new Date().toISOString(),
    }
    mockConsents.set(accountId, next)
    return next
  },
  async getEngineConfig() {
    return mockEngine
  },
  async setEngineConfig(body) {
    // Mirror the server read-merge: an omitted warmSurfaces preserves the stored map.
    const warmSurfaces = body.warmSurfaces !== undefined ? body.warmSurfaces : mockEngine.warmSurfaces
    mockEngine = {
      notificationsEnabled: body.notificationsEnabled,
      ...(warmSurfaces ? { warmSurfaces } : {}),
      updatedAt: new Date().toISOString(),
    }
    return mockEngine
  },
  async getRunHistory() {
    return MOCK_RUN_HISTORY
  },
}

// Representative run-history for local dev + UI review (M19 #573/#579). Modelled as
// already-projected views for the mock site-admin+owner persona: a healthy run, and a
// partial run showing an OWNED account with an Option-B skipped ticker, an OWNED errored
// account (detail error reason), and a NON-owned errored account (admin summary-only).
const MOCK_RUN_HISTORY: NotificationRunHistoryView = {
  runs: [
    {
      showCrossAccountHeader: true,
      runId: 'run-2026-07-03',
      ranAt: '2026-07-03T20:00:00.000Z',
      status: 'partial',
      accountsEvaluated: 3,
      accountsErrored: 2,
      emailsSent: 1,
      accounts: [
        {
          accountId: 'acc-personal',
          accountName: "Steve's Portfolio",
          accountStatus: 'processed',
          visibility: 'detail',
          transitions: [{ ticker: 'CBA.AX', from: 'HOLD', to: 'BUY' }],
          emailsSent: 1,
          skippedTickers: ['WDS.AX'],
          memberOutcomes: [
            { userId: 'u1', email: 'stevemoodie70@gmail.com', outcome: 'sent', reason: 'delivered', tickers: ['CBA.AX'] },
          ],
        },
        {
          accountId: 'acc-family',
          accountName: 'Family Trust',
          accountStatus: 'error',
          visibility: 'detail',
          error: 'credit-balance',
          transitions: [],
          emailsSent: 0,
          memberOutcomes: [
            { userId: 'u2', email: 'partner@example.com', outcome: 'skipped', reason: 'credit-balance' },
          ],
        },
        {
          accountId: 'acc-syndicate',
          accountName: 'Shared Syndicate',
          accountStatus: 'error',
          visibility: 'summary',
          error: 'processing-failed',
          transitions: [],
          emailsSent: 0,
          memberOutcomes: [],
        },
      ],
    },
    {
      showCrossAccountHeader: true,
      runId: 'run-2026-07-02',
      ranAt: '2026-07-02T20:00:00.000Z',
      status: 'success',
      accountsEvaluated: 1,
      accountsErrored: 0,
      emailsSent: 2,
      accounts: [
        {
          accountId: 'acc-personal',
          accountName: "Steve's Portfolio",
          accountStatus: 'processed',
          visibility: 'detail',
          transitions: [{ ticker: 'BHP.AX', from: 'NEUTRAL', to: 'BUY' }],
          emailsSent: 2,
          memberOutcomes: [
            { userId: 'u1', email: 'stevemoodie70@gmail.com', outcome: 'sent', reason: 'delivered', tickers: ['BHP.AX'] },
          ],
        },
      ],
    },
  ] satisfies NotificationRunView[],
}

// ── Live — settings Lambda (account derived from the X-Account-Id header) ───────
const realService: NotificationPreferencesService = {
  async getConfig() {
    return (await stockAnalyserClient.getNotificationConfig()).config
  },
  async putConfig(_accountId, body) {
    return (await stockAnalyserClient.updateNotificationConfig(body)).config
  },
  async getConsent() {
    return (await stockAnalyserClient.getNotificationConsent()).consent
  },
  async putConsent(_accountId, receiveConsent) {
    return (await stockAnalyserClient.updateNotificationConsent({ receiveConsent })).consent
  },
  async getEngineConfig() {
    return (await stockAnalyserClient.getNotificationEngineConfig()).config
  },
  async setEngineConfig(body) {
    return (await stockAnalyserClient.updateNotificationEngineConfig(body)).config
  },
  // The server already projects run-history per viewer — consume the response as-is.
  async getRunHistory() {
    return stockAnalyserClient.getNotificationRunHistory()
  },
}

export const stockAnalyserNotificationService: NotificationPreferencesService =
  getConfig().storage.provider === 'local' ? mockService : realService
