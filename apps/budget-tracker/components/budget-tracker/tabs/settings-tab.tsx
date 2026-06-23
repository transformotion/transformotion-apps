"use client"

import { useState, useEffect } from "react"
import { useBudgetStore } from "@/stores/budget-tracker/use-budget-store"
import { selectUser, useAuthStore } from "@/stores/auth/use-auth-store"
import { PageHeader, Card, PrimaryButton, SecondaryButton } from "@transformotion/ui-primitives"
import { Settings, RotateCcw, Save, Cpu, AlertCircle, Check, Lock } from "lucide-react"
import type { BudgetSettings } from "@transformotion/budget-domain"
import {
  getBudgetAiConfig,
  resetBudgetAiOverride,
  SUPPORTED_AI_MODELS,
  updateBudgetAiOverride,
  type AiProviderId,
  type AppAiRuntimeConfigResponse,
} from "@/lib/services/ai-runtime-config"

const DEFAULT_AI_SETTINGS = {
  aiReviewBatchSize: 5,
  aiReviewParallelLimit: 4,
  aiReviewConfidenceThreshold: 'low' as const,
}

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
      const next = await getBudgetAiConfig()
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
      const next = await updateBudgetAiOverride({ provider, model })
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
      const next = await resetBudgetAiOverride()
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
    <Card>
      <div className="flex items-center gap-2 mb-4">
        <div className="size-8 rounded-lg bg-primary/15 flex items-center justify-center">
          <Cpu className="size-4 text-primary" />
        </div>
        <div>
          <h3 className="font-display text-sm font-semibold tracking-wide text-foreground">AI Engine</h3>
          <p className="text-xs text-muted-foreground">
            Choose the provider and model Budget Tracker uses for AI features.
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-signal-red/30 bg-signal-red/10 px-3 py-2 text-xs text-signal-red">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="rounded-lg border border-border bg-surface2/60 p-3 space-y-2 mb-5">
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
          <div className="space-y-5">
            <div>
              <label className="text-xs font-medium text-foreground block mb-1">Provider</label>
              <select
                value={provider}
                disabled={loading || saving}
                onChange={(e) => {
                  const nextProvider = e.target.value as AiProviderId
                  setSaved(false)
                  setProvider(nextProvider)
                  setModel(SUPPORTED_AI_MODELS[nextProvider]?.[0] ?? "")
                }}
                className="w-full h-9 px-3 rounded-lg bg-surface2 border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {PROVIDER_OPTIONS.map((option) => (
                  <option key={option} value={option}>{PROVIDER_LABELS[option]}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-foreground block mb-1">Model</label>
              <select
                value={model}
                disabled={loading || saving}
                onChange={(e) => { setSaved(false); setModel(e.target.value) }}
                className="w-full h-9 px-3 rounded-lg bg-surface2 border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {models.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center mt-5 pt-4 border-t border-border">
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
        <div className="flex items-start gap-2 rounded-lg border border-border bg-surface2/60 px-3 py-2 text-xs text-muted-foreground">
          <Lock className="mt-0.5 size-4 shrink-0" />
          <span>AI provider/model overrides are managed by site administrators.</span>
        </div>
      )}
    </Card>
  )
}

export function SettingsTab() {
  const settings = useBudgetStore((s) => s.settings)
  const updateSettings = useBudgetStore((s) => s.updateSettings)

  const [batchSize, setBatchSize] = useState(String(settings.aiReviewBatchSize ?? DEFAULT_AI_SETTINGS.aiReviewBatchSize))
  const [parallelLimit, setParallelLimit] = useState(String(settings.aiReviewParallelLimit ?? DEFAULT_AI_SETTINGS.aiReviewParallelLimit))
  const [confidenceThreshold, setConfidenceThreshold] = useState<'low' | 'medium' | 'high'>(
    settings.aiReviewConfidenceThreshold ?? DEFAULT_AI_SETTINGS.aiReviewConfidenceThreshold
  )
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Sync when store settings change (e.g. after initial load)
  useEffect(() => {
    setBatchSize(String(settings.aiReviewBatchSize ?? DEFAULT_AI_SETTINGS.aiReviewBatchSize))
    setParallelLimit(String(settings.aiReviewParallelLimit ?? DEFAULT_AI_SETTINGS.aiReviewParallelLimit))
    setConfidenceThreshold(settings.aiReviewConfidenceThreshold ?? DEFAULT_AI_SETTINGS.aiReviewConfidenceThreshold)
  }, [settings.aiReviewBatchSize, settings.aiReviewParallelLimit, settings.aiReviewConfidenceThreshold])

  const batchSizeNum = parseInt(batchSize, 10)
  const parallelLimitNum = parseInt(parallelLimit, 10)

  const batchSizeValid = !isNaN(batchSizeNum) && batchSizeNum >= 1 && batchSizeNum <= 20
  const parallelLimitValid = !isNaN(parallelLimitNum) && parallelLimitNum >= 1 && parallelLimitNum <= 10

  const currentBatchSize = settings.aiReviewBatchSize ?? DEFAULT_AI_SETTINGS.aiReviewBatchSize
  const currentParallelLimit = settings.aiReviewParallelLimit ?? DEFAULT_AI_SETTINGS.aiReviewParallelLimit
  const currentThreshold = settings.aiReviewConfidenceThreshold ?? DEFAULT_AI_SETTINGS.aiReviewConfidenceThreshold

  const hasChanges =
    (batchSizeValid && batchSizeNum !== currentBatchSize) ||
    (parallelLimitValid && parallelLimitNum !== currentParallelLimit) ||
    confidenceThreshold !== currentThreshold

  const canSave = hasChanges && batchSizeValid && parallelLimitValid

  async function handleSave() {
    if (!canSave) return
    setSaving(true)
    try {
      const updates: Partial<BudgetSettings> = {
        aiReviewBatchSize: batchSizeNum,
        aiReviewParallelLimit: parallelLimitNum,
        aiReviewConfidenceThreshold: confidenceThreshold,
      }
      await updateSettings(updates)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  function handleReset() {
    setBatchSize(String(DEFAULT_AI_SETTINGS.aiReviewBatchSize))
    setParallelLimit(String(DEFAULT_AI_SETTINGS.aiReviewParallelLimit))
    setConfidenceThreshold(DEFAULT_AI_SETTINGS.aiReviewConfidenceThreshold)
  }

  return (
    <div className="p-4 space-y-4 overflow-hidden">
      <PageHeader
        title="Settings"
        subtitle="Configure Budget Tracker preferences"
        titleClassName="font-display text-xl uppercase tracking-wide"
      />

      <Card>
        <div className="flex items-center gap-2 mb-4">
          <div className="size-8 rounded-lg bg-primary/15 flex items-center justify-center">
            <Settings className="size-4 text-primary" />
          </div>
          <h3 className="font-display text-sm font-semibold tracking-wide text-foreground">AI Review Configuration</h3>
        </div>

        <div className="space-y-5">
          {/* Batch size */}
          <div>
            <label className="text-xs font-medium text-foreground block mb-1">
              Batch size
              <span className="ml-2 text-[10px] font-normal text-muted-foreground">(1–20)</span>
            </label>
            <input
              type="number"
              min={1}
              max={20}
              value={batchSize}
              onChange={(e) => { setSaved(false); setBatchSize(e.target.value) }}
              className={`w-full h-9 px-3 rounded-lg bg-surface2 border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary ${
                batchSize !== '' && !batchSizeValid ? 'border-signal-red' : 'border-border'
              }`}
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Transactions processed per AI call. Smaller batches fit within timeout limits.
            </p>
            {batchSize !== '' && !batchSizeValid && (
              <p className="text-[11px] text-signal-red mt-0.5">Must be between 1 and 20.</p>
            )}
          </div>

          {/* Parallel limit */}
          <div>
            <label className="text-xs font-medium text-foreground block mb-1">
              Parallel limit
              <span className="ml-2 text-[10px] font-normal text-muted-foreground">(1–10)</span>
            </label>
            <input
              type="number"
              min={1}
              max={10}
              value={parallelLimit}
              onChange={(e) => { setSaved(false); setParallelLimit(e.target.value) }}
              className={`w-full h-9 px-3 rounded-lg bg-surface2 border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary ${
                parallelLimit !== '' && !parallelLimitValid ? 'border-signal-red' : 'border-border'
              }`}
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Maximum concurrent AI calls. Higher values process faster but risk rate limits.
            </p>
            {parallelLimit !== '' && !parallelLimitValid && (
              <p className="text-[11px] text-signal-red mt-0.5">Must be between 1 and 10.</p>
            )}
          </div>

          {/* Confidence threshold */}
          <div>
            <label className="text-xs font-medium text-foreground block mb-1">
              Confidence threshold for web search
            </label>
            <select
              value={confidenceThreshold}
              onChange={(e) => { setSaved(false); setConfidenceThreshold(e.target.value as 'low' | 'medium' | 'high') }}
              className="w-full h-9 px-3 rounded-lg bg-surface2 border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="low">Low — only re-run low-confidence results</option>
              <option value="medium">Medium — re-run low and medium-confidence results</option>
              <option value="high">High — re-run everything except high-confidence results (slowest, highest API cost)</option>
            </select>
            <p className="text-[11px] text-muted-foreground mt-1">
              Which confidence levels trigger web-search re-categorisation. &apos;Low&apos; is fastest; &apos;High&apos; uses web search for almost all transactions.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 mt-5 pt-4 border-t border-border">
          <PrimaryButton
            onClick={handleSave}
            disabled={!canSave || saving}
            className="flex-1"
          >
            {saving ? (
              <>
                <span className="inline-block animate-spin mr-2 size-3 border-2 border-white border-t-transparent rounded-full" />
                Saving...
              </>
            ) : saved ? (
              <>
                <Save className="size-4 mr-2" />
                Saved
              </>
            ) : (
              <>
                <Save className="size-4 mr-2" />
                Save changes
              </>
            )}
          </PrimaryButton>
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 px-3 h-9 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-surface2 transition-colors"
          >
            <RotateCcw className="size-3.5" />
            Defaults
          </button>
        </div>
      </Card>

      <AiEngineCard />
    </div>
  )
}
