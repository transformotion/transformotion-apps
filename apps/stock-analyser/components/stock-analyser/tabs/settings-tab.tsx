"use client"

import { useEffect, useState } from "react"
import { useNavigation } from "../app-shell"
import { selectUser, useAuthStore } from "@/stores/auth/use-auth-store"
import { PageHeader, Card, PrimaryButton, SecondaryButton, SegmentedControl, TextToggle } from "@transformotion/ui-primitives"
import { AlertCircle, Check, Cpu, FileText, Lock, RotateCcw, Save, Zap } from "lucide-react"
import type { SearchMode } from "../app-shell"
import { notifyCacheFreshnessPolicyUpdated } from "@/lib/hooks"
import type { User } from "@transformotion/auth-client"
import { cn } from "@/lib/utils"
import {
  stockAnalyserSettingsService,
  SUPPORTED_AI_MODELS,
  type AiProviderId,
  type AppAiRuntimeConfigResponse,
} from "@/lib/services/settings/settings-service"
import {
  DEFAULT_CACHE_FRESHNESS_PRESETS,
  MIN_FRESHNESS_RATIO_GAP,
  isValidCacheFreshnessPolicy,
  type CacheFreshnessConfigRecord,
  type CacheFreshnessPreset,
  type StockAnalyserCacheFreshnessPolicy,
} from "@transformotion/contracts/stock-analyser/cache-freshness"

const PROVIDER_OPTIONS = Object.keys(SUPPORTED_AI_MODELS) as AiProviderId[]

const PROVIDER_LABELS: Record<AiProviderId, string> = {
  claude: "Claude (Anthropic)",
  openai: "OpenAI",
}

const SOURCE_LABELS: Record<AppAiRuntimeConfigResponse["effective"]["source"], string> = {
  app_override: "APP OVERRIDE",
  platform_default: "PLATFORM DEFAULT",
  environment_fallback: "ENVIRONMENT FALLBACK",
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-signal-red/30 bg-signal-red/10 px-3 py-2 text-xs text-signal-red">
      <AlertCircle className="mt-0.5 size-4 shrink-0" />
      <span>{message}</span>
    </div>
  )
}

function userCanEditStockAnalyserAdmin(user: User | null) {
  const meta = user?.metadata as { siteAdmin?: boolean; appAdmin?: string[] } | undefined
  return meta?.siteAdmin === true || (meta?.appAdmin ?? []).includes("stock-analyser")
}

function AnalysisTextCard() {
  const { showExplanatoryText, setShowExplanatoryText } = useNavigation()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    stockAnalyserSettingsService.getSettings()
      .then((settings) => setShowExplanatoryText(settings.explanatoryTextEnabled))
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load display preferences"))
  }, [setShowExplanatoryText])

  async function updatePreference(next: boolean) {
    setSaving(true)
    setError(null)
    try {
      setShowExplanatoryText(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save display preference")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="size-9 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
          <FileText className="size-5 text-primary" />
        </div>
        <div>
          <h3 className="font-display text-sm font-semibold tracking-wide text-foreground">Analysis text</h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Show explanatory analysis text alongside signals and verdicts. This is saved as a user preference for the active account.
          </p>
        </div>
      </div>

      {error && <ErrorBanner message={error} />}

      <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface2/60 px-3 py-3">
        <div>
          <p className="text-sm font-medium text-foreground">Explanatory text</p>
          <p className="text-xs text-muted-foreground">
            {showExplanatoryText ? "Shown across analysis views" : "Hidden across analysis views"}
          </p>
        </div>
        <div className={saving ? "pointer-events-none opacity-60" : ""}>
          <TextToggle
            visible={showExplanatoryText}
            onToggle={() => void updatePreference(!showExplanatoryText)}
            size="md"
          />
        </div>
      </div>
    </Card>
  )
}

const SEARCH_MODE_LABELS: Record<SearchMode, string> = { fast: "Fast", live: "Live" }
const SEARCH_MODE_FROM_LABEL: Record<string, SearchMode> = { Fast: "fast", Live: "live" }

function DefaultSearchModeCard() {
  const { defaultSearchMode, setDefaultSearchMode } = useNavigation()

  return (
    <Card className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="size-9 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
          <Zap className="size-5 text-primary" />
        </div>
        <div>
          <h3 className="font-display text-sm font-semibold tracking-wide text-foreground">Default search mode</h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            The mode each analysis and recommendation view starts in. Live uses fresh AI analysis; Fast favours cached results.
            Per-run mode changes do not alter this default.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface2/60 px-3 py-3">
        <div>
          <p className="text-sm font-medium text-foreground">Mode</p>
          <p className="text-xs text-muted-foreground">
            New searches start in {SEARCH_MODE_LABELS[defaultSearchMode]} mode
          </p>
        </div>
        <div className="w-40">
          <SegmentedControl
            options={["Fast", "Live"]}
            value={SEARCH_MODE_LABELS[defaultSearchMode]}
            onChange={(label) => setDefaultSearchMode(SEARCH_MODE_FROM_LABEL[label])}
          />
        </div>
      </div>
    </Card>
  )
}

function AiEngineCard() {
  const user = useAuthStore(selectUser)
  const siteAdmin = user?.metadata?.siteAdmin === true
  const [config, setConfig] = useState<AppAiRuntimeConfigResponse | null>(null)
  const [provider, setProvider] = useState<AiProviderId>("claude")
  const [model, setModel] = useState("claude-sonnet-4-6")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const effective = config?.effective
  const override = config?.appOverride
  const models = SUPPORTED_AI_MODELS[provider] ?? []
  const isDirty = !override || provider !== override.provider || model !== override.model

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const next = await stockAnalyserSettingsService.getAiConfig()
      setConfig(next)
      setProvider(next.effective.provider)
      setModel(next.effective.model)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load AI Engine settings")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function handleSaveOverride() {
    setSaving(true)
    setError(null)
    try {
      const next = await stockAnalyserSettingsService.updateAiOverride({ provider, model })
      setConfig(next)
      setProvider(next.effective.provider)
      setModel(next.effective.model)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save AI Engine override")
    } finally {
      setSaving(false)
    }
  }

  async function handleResetOverride() {
    setSaving(true)
    setError(null)
    try {
      const next = await stockAnalyserSettingsService.resetAiOverride()
      setConfig(next)
      setProvider(next.effective.provider)
      setModel(next.effective.model)
      setSaved(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reset AI Engine override")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="space-y-5">
      <div className="flex items-start gap-3">
        <div className="size-9 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
          <Cpu className="size-5 text-primary" />
        </div>
        <div>
          <h3 className="font-display text-sm font-semibold tracking-wide text-foreground">AI Engine</h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Choose the provider and model Stock Analyser uses for AI analysis. Leaving the override unset inherits the Launchpad platform default.
          </p>
        </div>
      </div>

      {error && <ErrorBanner message={error} />}

      <div className="rounded-xl border border-border bg-surface2/60 p-3 space-y-2">
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-muted-foreground">Platform default</span>
          <span className="text-foreground text-right">
            {config?.platformDefault
              ? `${config.platformDefault.provider} / ${config.platformDefault.model}`
              : loading ? "loading" : "environment fallback"}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-muted-foreground">Effective now</span>
          <span className="text-foreground text-right">
            {effective ? `${effective.provider} / ${effective.model}` : "loading"}
            {effective && (
              <span className="ml-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                {SOURCE_LABELS[effective.source]}
              </span>
            )}
          </span>
        </div>
      </div>

      {siteAdmin ? (
        <>
          <div className="space-y-1.5">
            <label htmlFor="sa-ai-provider" className="block text-sm font-medium text-foreground">Provider</label>
            <select
              id="sa-ai-provider"
              value={provider}
              disabled={loading || saving}
              onChange={(e) => {
                const nextProvider = e.target.value as AiProviderId
                setSaved(false)
                setProvider(nextProvider)
                setModel(SUPPORTED_AI_MODELS[nextProvider]?.[0] ?? "")
              }}
              className="w-full h-11 px-3 rounded-xl bg-surface2 border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              {PROVIDER_OPTIONS.map((option) => (
                <option key={option} value={option}>{PROVIDER_LABELS[option]}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="sa-ai-model" className="block text-sm font-medium text-foreground">Model</label>
            <select
              id="sa-ai-model"
              value={model}
              disabled={loading || saving}
              onChange={(e) => { setSaved(false); setModel(e.target.value) }}
              className="w-full h-11 px-3 rounded-xl bg-surface2 border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              {models.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center pt-2 border-t border-border">
            {saved && (
              <span className="flex items-center gap-1.5 text-xs text-signal-green sm:mr-auto" role="status">
                <Check className="size-4" />
                Override saved
              </span>
            )}
            <SecondaryButton onClick={handleResetOverride} disabled={!override || loading || saving}>
              <RotateCcw className="size-4 mr-2" />
              Reset to platform default
            </SecondaryButton>
            <PrimaryButton onClick={handleSaveOverride} disabled={!isDirty || loading || saving}>
              <Save className="size-4 mr-2" />
              {saving ? "Saving..." : "Save override"}
            </PrimaryButton>
          </div>
        </>
      ) : (
        <div className="flex items-start gap-2 rounded-xl border border-border bg-surface2/60 px-3 py-2 text-xs text-muted-foreground">
          <Lock className="mt-0.5 size-4 shrink-0" />
          <span>AI provider/model overrides are managed by site administrators.</span>
        </div>
      )}
    </Card>
  )
}

const pct = (ratio: number) => Math.round(ratio * 100)

function policiesEqual(
  a: StockAnalyserCacheFreshnessPolicy,
  b: StockAnalyserCacheFreshnessPolicy,
) {
  return (
    a.freshUntilElapsedRatio === b.freshUntilElapsedRatio &&
    a.staleFromElapsedRatio === b.staleFromElapsedRatio &&
    a.showOutdatedState === b.showOutdatedState
  )
}

function BandPreview({ policy }: { policy: StockAnalyserCacheFreshnessPolicy }) {
  const fresh = pct(policy.freshUntilElapsedRatio)
  const stale = pct(policy.staleFromElapsedRatio)
  return (
    <div className="space-y-1.5">
      <div className="flex h-2.5 w-full overflow-hidden rounded-full" aria-hidden="true">
        <div className="bg-signal-green" style={{ width: `${fresh}%` }} />
        <div className="bg-signal-amber" style={{ width: `${stale - fresh}%` }} />
        <div className="bg-signal-red" style={{ width: `${100 - stale}%` }} />
      </div>
      <div className="flex justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
        <span className="text-signal-green">Fresh 0-{fresh}%</span>
        <span className="text-signal-amber">Recent {fresh}-{stale}%</span>
        <span className="text-signal-red">Stale {stale}-100%</span>
      </div>
    </div>
  )
}

function CacheFreshnessCard() {
  const user = useAuthStore(selectUser)
  const canEdit = userCanEditStockAnalyserAdmin(user)
  const [config, setConfig] = useState<CacheFreshnessConfigRecord | null>(null)
  const [draft, setDraft] = useState<StockAnalyserCacheFreshnessPolicy>(DEFAULT_CACHE_FRESHNESS_PRESETS[1].policy)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const next = await stockAnalyserSettingsService.getCacheFreshnessConfig()
      setConfig(next)
      setDraft(next.activePolicy)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load cache freshness policy")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const active = config?.activePolicy ?? draft
  const presets = config?.presets ?? DEFAULT_CACHE_FRESHNESS_PRESETS
  const isDirty = config ? !policiesEqual(draft, active) : false
  const invalid = !isValidCacheFreshnessPolicy(draft)

  async function savePolicy(policy = draft, presetsOverride = presets) {
    setSaving(true)
    setError(null)
    try {
      const next = await stockAnalyserSettingsService.updateCacheFreshnessConfig({
        activePolicy: policy,
        presets: presetsOverride,
      })
      setConfig(next)
      setDraft(next.activePolicy)
      notifyCacheFreshnessPolicyUpdated()
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save cache freshness policy")
    } finally {
      setSaving(false)
    }
  }

  async function resetPolicy() {
    setSaving(true)
    setError(null)
    try {
      const next = await stockAnalyserSettingsService.resetCacheFreshnessConfig()
      setConfig(next)
      setDraft(next.activePolicy)
      notifyCacheFreshnessPolicyUpdated()
      setSaved(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reset cache freshness policy")
    } finally {
      setSaving(false)
    }
  }

  function updateRatio(field: "freshUntilElapsedRatio" | "staleFromElapsedRatio", value: string) {
    const numeric = Number(value)
    if (!Number.isFinite(numeric)) return
    setDraft(prev => ({ ...prev, [field]: numeric / 100 }))
    setSaved(false)
  }

  return (
    <Card className="space-y-5">
      <div className="flex items-start gap-3">
        <div className="size-9 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
          <Zap className="size-5 text-primary" />
        </div>
        <div>
          <h3 className="font-display text-sm font-semibold tracking-wide text-foreground">Cache freshness</h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Thresholds classify cached results only. Cache expiry, writes, refreshes, and AI analysis do not change.
          </p>
        </div>
      </div>

      {error && <ErrorBanner message={error} />}

      <div className="rounded-xl border border-border bg-surface2/60 p-3 space-y-3">
        <BandPreview policy={active} />
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Past-expiry data</span>
          <span className="text-foreground">{active.showOutdatedState ? "Outdated" : "Stale"}</span>
        </div>
      </div>

      {canEdit ? (
        <>
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">Presets</p>
            <div className="flex flex-wrap gap-2">
              {presets.map((preset: CacheFreshnessPreset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => { setDraft(preset.policy); setSaved(false) }}
                  className="rounded-lg border border-border bg-surface2 px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:border-primary/40"
                  title={`${preset.label}: Fresh < ${pct(preset.policy.freshUntilElapsedRatio)}%, stale >= ${pct(preset.policy.staleFromElapsedRatio)}%`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="space-y-1.5">
              <span className="text-sm font-medium text-foreground">Fresh until (%)</span>
              <input
                type="number"
                min={0}
                max={95}
                step={1}
                value={pct(draft.freshUntilElapsedRatio)}
                onChange={(e) => updateRatio("freshUntilElapsedRatio", e.target.value)}
                className="w-full h-11 px-3 rounded-xl bg-surface2 border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-sm font-medium text-foreground">Stale from (%)</span>
              <input
                type="number"
                min={5}
                max={100}
                step={1}
                value={pct(draft.staleFromElapsedRatio)}
                onChange={(e) => updateRatio("staleFromElapsedRatio", e.target.value)}
                className="w-full h-11 px-3 rounded-xl bg-surface2 border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </label>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface2/60 px-3 py-3">
            <div>
              <p className="text-sm font-medium text-foreground">Show Outdated state</p>
              <p className="text-xs text-muted-foreground">
                {draft.showOutdatedState ? "Expired cache displays Outdated" : "Expired cache displays Stale"}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={draft.showOutdatedState}
              onClick={() => setDraft(prev => ({ ...prev, showOutdatedState: !prev.showOutdatedState }))}
              className={cn(
                "relative h-6 w-11 shrink-0 rounded-full border transition-colors",
                draft.showOutdatedState ? "bg-primary border-primary" : "bg-surface2 border-border",
              )}
            >
              <span
                className={cn(
                  "absolute top-1/2 -translate-y-1/2 size-5 rounded-full bg-white shadow-sm transition-[left]",
                  draft.showOutdatedState ? "left-[22px]" : "left-0.5",
                )}
              />
            </button>
          </div>

          {invalid && (
            <p className="text-xs text-signal-red">
              Fresh must be below stale with at least {Math.round(MIN_FRESHNESS_RATIO_GAP * 100)}% between them.
            </p>
          )}

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center pt-2 border-t border-border">
            {saved && (
              <span className="flex items-center gap-1.5 text-xs text-signal-green sm:mr-auto" role="status">
                <Check className="size-4" />
                Policy saved
              </span>
            )}
            <SecondaryButton onClick={() => setDraft(active)} disabled={!isDirty || loading || saving}>
              Cancel
            </SecondaryButton>
            <SecondaryButton onClick={resetPolicy} disabled={loading || saving}>
              <RotateCcw className="size-4 mr-2" />
              Reset defaults
            </SecondaryButton>
            <PrimaryButton onClick={() => void savePolicy()} disabled={!isDirty || invalid || loading || saving}>
              <Save className="size-4 mr-2" />
              {saving ? "Saving..." : "Save policy"}
            </PrimaryButton>
          </div>
        </>
      ) : (
        <div className="flex items-start gap-2 rounded-xl border border-border bg-surface2/60 px-3 py-2 text-xs text-muted-foreground">
          <Lock className="mt-0.5 size-4 shrink-0" />
          <span>Cache freshness thresholds are managed by site and Stock Analyser administrators.</span>
        </div>
      )}
    </Card>
  )
}

export function SettingsTab() {
  return (
    <div className="p-4 space-y-6 max-w-2xl">
      <PageHeader
        title="Settings"
        subtitle="Display preferences and AI engine configuration"
        titleClassName="font-display uppercase tracking-wide"
      />
      <AnalysisTextCard />
      <DefaultSearchModeCard />
      <CacheFreshnessCard />
      <AiEngineCard />
    </div>
  )
}
