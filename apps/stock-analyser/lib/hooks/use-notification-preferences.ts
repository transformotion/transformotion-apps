"use client"

import { useCallback, useEffect, useState } from "react"
import { authService } from "@/lib/services/auth"
import { selectUser, useAuthStore } from "@/stores/auth/use-auth-store"
import {
  isNotificationFeatureApplicable,
  normalizeIntervalDays,
  resolveNotificationVisibility,
  type NotificationAccountConfig,
  type NotificationEngineConfig,
  type NotificationMemberConsent,
  type NotificationViewerContext,
  type NotificationVisibility,
  type WarmSurface,
} from "@transformotion/contracts/stock-analyser/notification-preferences"
import type { NotificationRunHistoryView } from "@transformotion/contracts/stock-analyser/notification-run-history"
import { stockAnalyserNotificationService } from "@/lib/services/notifications/notification-preferences-service"

/**
 * Resolved notification-preferences state for the Settings card (M19 #534).
 *
 * Runtime rebuild of the v0 hook: the role-conditional VISIBILITY uses the synced
 * contract resolvers (one source of truth — the matrix is NOT reimplemented); the
 * DATA is fetched from the real notification-preferences service, and the viewer
 * CONTEXT is derived from the live auth (role on the active account + supervisory
 * group flags) rather than the v0 mock control-plane store. The card is ported
 * verbatim; only this data layer differs (CONTRIBUTING §8.A).
 *
 * `ready` is false until the client resolves the persona so the card never flashes
 * privileged controls. The card's visibility logic is UX — runtime ALSO enforces
 * authorization server-side regardless of what rendered.
 */
export interface UseNotificationPreferencesResult {
  ready: boolean
  context: NotificationViewerContext
  visibility: NotificationVisibility
  config: NotificationAccountConfig | null
  consent: NotificationMemberConsent | null
  engine: NotificationEngineConfig | null
  /**
   * Run-history LIST (most-recent-first), ALREADY PROJECTED to what this viewer
   * may see (#573). The server is the scoping boundary; the client consumes the
   * response as the view (it does NOT call projectRunHistoryForViewer). `null`
   * when there is nothing to show, so the card omits the section entirely.
   */
  runHistory: NotificationRunHistoryView | null
  setIntervalDays: (days: number) => void
  setActiveTypes: (types: NotificationAccountConfig["activeTypes"]) => void
  setReceiveConsent: (receive: boolean) => void
  setNotificationsEnabled: (enabled: boolean) => void
  /** Toggle a single per-surface daily-warm gate (M19). Sends the full map + current master flag. */
  setWarmSurface: (surface: WarmSurface, enabled: boolean) => void
}

const HIDDEN_VISIBILITY: NotificationVisibility = {
  intervalDays: "hidden",
  typeSelection: "hidden",
  receiveConsent: "hidden",
  engineToggle: "hidden",
  allHidden: true,
}

const EMPTY_CONTEXT: NotificationViewerContext = {
  accountRole: null,
  isSiteAdmin: false,
  isAppAdmin: false,
}

export function useNotificationPreferences(
  activeAccountId: string | null,
): UseNotificationPreferencesResult {
  const user = useAuthStore(selectUser)
  const [ready, setReady] = useState(false)
  const [context, setContext] = useState<NotificationViewerContext>(EMPTY_CONTEXT)
  const [config, setConfig] = useState<NotificationAccountConfig | null>(null)
  const [consent, setConsent] = useState<NotificationMemberConsent | null>(null)
  const [engine, setEngine] = useState<NotificationEngineConfig | null>(null)
  const [runHistory, setRunHistory] = useState<NotificationRunHistoryView | null>(null)

  const isSiteAdmin = user?.metadata?.siteAdmin === true
  const isAppAdmin = ((user?.metadata?.appAdmin as string[] | undefined) ?? []).includes("stock-analyser")

  useEffect(() => {
    let cancelled = false
    setReady(false)
    ;(async () => {
      let accountRole: NotificationViewerContext["accountRole"] = null
      if (activeAccountId) {
        const accounts = await authService.getAccountsForApp("stock-analyser").catch(() => [])
        accountRole =
          (accounts.find((a) => a.accountId === activeAccountId)?.role as NotificationViewerContext["accountRole"]) ??
          null
      }
      const ctx: NotificationViewerContext = { accountRole, isSiteAdmin, isAppAdmin }

      let cfg: NotificationAccountConfig | null = null
      let cns: NotificationMemberConsent | null = null
      let eng: NotificationEngineConfig | null = null
      let rh: NotificationRunHistoryView | null = null
      if (activeAccountId && isNotificationFeatureApplicable(ctx)) {
        ;[cfg, cns, eng, rh] = await Promise.all([
          stockAnalyserNotificationService.getConfig(activeAccountId).catch(() => null),
          stockAnalyserNotificationService.getConsent(activeAccountId).catch(() => null),
          stockAnalyserNotificationService.getEngineConfig().catch(() => null),
          // The server already projects run-history per viewer — consume as-is.
          // Empty-runs responses collapse to null so the card omits the section.
          stockAnalyserNotificationService
            .getRunHistory()
            .then((view) => (view.runs.length > 0 ? view : null))
            .catch(() => null),
        ])
      }
      if (cancelled) return
      setContext(ctx)
      setConfig(cfg)
      setConsent(cns)
      setEngine(eng)
      setRunHistory(rh)
      setReady(true)
    })()
    return () => {
      cancelled = true
    }
  }, [activeAccountId, isSiteAdmin, isAppAdmin])

  const visibility = ready ? resolveNotificationVisibility(context) : HIDDEN_VISIBILITY

  const refetchConfig = useCallback(() => {
    if (activeAccountId) {
      stockAnalyserNotificationService.getConfig(activeAccountId).then(setConfig).catch(() => {})
    }
  }, [activeAccountId])
  const refetchConsent = useCallback(() => {
    if (activeAccountId) {
      stockAnalyserNotificationService.getConsent(activeAccountId).then(setConsent).catch(() => {})
    }
  }, [activeAccountId])
  const refetchEngine = useCallback(() => {
    stockAnalyserNotificationService.getEngineConfig().then(setEngine).catch(() => {})
  }, [])

  const setIntervalDays = useCallback(
    (days: number) => {
      if (!activeAccountId) return
      const next = normalizeIntervalDays(days)
      setConfig((c) => (c ? { ...c, intervalDays: next } : c)) // optimistic
      stockAnalyserNotificationService
        .putConfig(activeAccountId, { intervalDays: next })
        .then(setConfig)
        .catch(refetchConfig)
    },
    [activeAccountId, refetchConfig],
  )

  const setActiveTypes = useCallback(
    (types: NotificationAccountConfig["activeTypes"]) => {
      if (!activeAccountId) return
      setConfig((c) => (c ? { ...c, activeTypes: types } : c)) // optimistic
      stockAnalyserNotificationService
        .putConfig(activeAccountId, { activeTypes: types })
        .then(setConfig)
        .catch(refetchConfig)
    },
    [activeAccountId, refetchConfig],
  )

  const setReceiveConsent = useCallback(
    (receive: boolean) => {
      if (!activeAccountId) return
      setConsent((c) => (c ? { ...c, receiveConsent: receive } : c)) // optimistic
      stockAnalyserNotificationService
        .putConsent(activeAccountId, receive)
        .then(setConsent)
        .catch(refetchConsent)
    },
    [activeAccountId, refetchConsent],
  )

  const setNotificationsEnabled = useCallback(
    (enabled: boolean) => {
      setEngine((e) => (e ? { ...e, notificationsEnabled: enabled } : e)) // optimistic
      // warmSurfaces omitted → server preserves the stored map (read-merge).
      stockAnalyserNotificationService
        .setEngineConfig({ notificationsEnabled: enabled })
        .then(setEngine)
        .catch(refetchEngine)
    },
    [refetchEngine],
  )

  const setWarmSurface = useCallback(
    (surface: WarmSurface, enabled: boolean) => {
      const nextMap = { ...(engine?.warmSurfaces ?? {}), [surface]: enabled }
      setEngine((e) => (e ? { ...e, warmSurfaces: nextMap } : e)) // optimistic
      stockAnalyserNotificationService
        .setEngineConfig({ notificationsEnabled: engine?.notificationsEnabled ?? true, warmSurfaces: nextMap })
        .then(setEngine)
        .catch(refetchEngine)
    },
    [engine, refetchEngine],
  )

  return {
    ready,
    context,
    visibility,
    config,
    consent,
    engine,
    runHistory,
    setIntervalDays,
    setActiveTypes,
    setReceiveConsent,
    setNotificationsEnabled,
    setWarmSurface,
  }
}
