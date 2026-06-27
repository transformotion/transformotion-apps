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
} from '@transformotion/contracts/stock-analyser/notification-preferences'
import type { NotificationRunHistoryView } from '@transformotion/contracts/stock-analyser/notification-run-history'

export interface NotificationPreferencesService {
  getConfig(accountId: string): Promise<NotificationAccountConfig>
  putConfig(
    accountId: string,
    body: { intervalDays?: number; activeTypes?: NotificationType[] },
  ): Promise<NotificationAccountConfig>
  getConsent(accountId: string): Promise<NotificationMemberConsent>
  putConsent(accountId: string, receiveConsent: boolean): Promise<NotificationMemberConsent>
  // App-wide engine kill-switch (M19 #571) — a single global record, account-independent.
  getEngineConfig(): Promise<NotificationEngineConfig>
  setEngineConfig(notificationsEnabled: boolean): Promise<NotificationEngineConfig>
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
  async setEngineConfig(notificationsEnabled) {
    mockEngine = { notificationsEnabled, updatedAt: new Date().toISOString() }
    return mockEngine
  },
  async getRunHistory() {
    return { runs: [] }
  },
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
  async setEngineConfig(notificationsEnabled) {
    return (await stockAnalyserClient.updateNotificationEngineConfig({ notificationsEnabled })).config
  },
  // The server already projects run-history per viewer — consume the response as-is.
  async getRunHistory() {
    return stockAnalyserClient.getNotificationRunHistory()
  },
}

export const stockAnalyserNotificationService: NotificationPreferencesService =
  getConfig().storage.provider === 'local' ? mockService : realService
