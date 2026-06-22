"use client"

import { useEffect, useState } from "react"
import { useNavigation } from "../app-shell"
import { selectUser, useAuthStore } from "@/stores/auth/use-auth-store"
import { PageHeader, Card, PrimaryButton, SecondaryButton, TextToggle } from "@transformotion/ui-primitives"
import { AlertCircle, Check, Cpu, FileText, Lock, RotateCcw, Save } from "lucide-react"
import {
  stockAnalyserSettingsService,
  SUPPORTED_AI_MODELS,
  type AiProviderId,
  type AppAiRuntimeConfigResponse,
} from "@/lib/services/settings/settings-service"

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
          <h3 className="text-sm font-semibold text-foreground">Analysis text</h3>
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
          <h3 className="text-sm font-semibold text-foreground">AI Engine</h3>
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

export function SettingsTab() {
  return (
    <div className="p-4 space-y-6 max-w-2xl">
      <PageHeader
        title="Settings"
        subtitle="Display preferences and AI engine configuration"
        titleClassName="font-display uppercase tracking-wide"
      />
      <AnalysisTextCard />
      <AiEngineCard />
    </div>
  )
}
