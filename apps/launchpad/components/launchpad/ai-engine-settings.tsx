'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, RefreshCw, RotateCcw, Save, X } from 'lucide-react'
import { authService } from '@/lib/services/auth'
import {
  FALLBACK_SUPPORTED_MODELS,
  getAiRuntimeConfig,
  resetAppOverride,
  updateAppOverride,
  updatePlatformDefault,
  type AiConfigAppSlug,
  type AiConfigSource,
  type AiProviderId,
  type AiRuntimeConfigResponse,
  type AiRuntimeConfigUpdate,
} from '@/lib/services/ai-runtime-config'

const APP_LABELS: Record<AiConfigAppSlug, string> = {
  'stock-analyser': 'Stock Analyser',
  'budget-tracker': 'Budget Tracker',
}

const SOURCE_LABELS: Record<AiConfigSource, string> = {
  app_override: 'app override',
  platform_default: 'platform default',
  environment_fallback: 'environment fallback',
}

interface DraftConfig {
  provider: AiProviderId
  model: string
}

const DEFAULT_DRAFT: DraftConfig = {
  provider: 'claude',
  model: 'claude-sonnet-4-6',
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-signal-red/30 bg-signal-red/10 px-3 py-2 text-sm text-signal-red">
      <AlertCircle className="mt-0.5 size-4 shrink-0" />
      <span>{message}</span>
    </div>
  )
}

function ConfigSelects({
  value,
  supportedModels,
  disabled,
  onChange,
}: {
  value: DraftConfig
  supportedModels: Record<AiProviderId, readonly string[]>
  disabled?: boolean
  onChange: (value: DraftConfig) => void
}) {
  const models = supportedModels[value.provider] ?? []
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="grid gap-1 text-sm">
        <span className="font-medium text-foreground">Provider</span>
        <select
          value={value.provider}
          disabled={disabled}
          onChange={(event) => {
            const provider = event.target.value as AiProviderId
            onChange({ provider, model: supportedModels[provider]?.[0] ?? '' })
          }}
          className="h-10 rounded-md border border-border bg-background px-3 text-sm text-foreground"
        >
          {(Object.keys(supportedModels) as AiProviderId[]).map((provider) => (
            <option key={provider} value={provider}>
              {provider}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-sm">
        <span className="font-medium text-foreground">Model</span>
        <select
          value={value.model}
          disabled={disabled}
          onChange={(event) => onChange({ ...value, model: event.target.value })}
          className="h-10 rounded-md border border-border bg-background px-3 text-sm text-foreground"
        >
          {models.map((model) => (
            <option key={model} value={model}>
              {model}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}

function SummaryRow({
  label,
  provider,
  model,
  source,
}: {
  label: string
  provider?: string
  model?: string
  source?: AiConfigSource
}) {
  return (
    <div className="grid gap-1 rounded-md border border-border bg-surface2/40 px-3 py-2 text-sm sm:grid-cols-[9rem_1fr] sm:items-center">
      <span className="font-medium text-muted-foreground">{label}</span>
      <span className="text-foreground">
        {provider && model ? `${provider} / ${model}` : 'not set'}
        {source ? <span className="ml-2 text-muted-foreground">({SOURCE_LABELS[source]})</span> : null}
      </span>
    </div>
  )
}

export function AiEngineSettings({
  isOpen,
  onClose,
}: {
  isOpen: boolean
  onClose: () => void
}) {
  const [idToken, setIdToken] = useState<string | null>(null)
  const [config, setConfig] = useState<AiRuntimeConfigResponse | null>(null)
  const [platformDraft, setPlatformDraft] = useState<DraftConfig>(DEFAULT_DRAFT)
  const [appDrafts, setAppDrafts] = useState<Record<AiConfigAppSlug, DraftConfig>>({
    'stock-analyser': DEFAULT_DRAFT,
    'budget-tracker': DEFAULT_DRAFT,
  })
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const supportedModels = useMemo(
    () => config?.supportedModels ?? FALLBACK_SUPPORTED_MODELS,
    [config?.supportedModels],
  )

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const token = idToken ?? await authService.getIdToken()
      if (!token) throw new Error('Authentication token is not available')
      setIdToken(token)
      const nextConfig = await getAiRuntimeConfig(token)
      setConfig(nextConfig)
      const platformDefault = nextConfig.platformDefault ?? DEFAULT_DRAFT
      setPlatformDraft({ provider: platformDefault.provider, model: platformDefault.model })
      setAppDrafts({
        'stock-analyser': {
          provider: nextConfig.appOverrides['stock-analyser']?.provider ?? nextConfig.effective['stock-analyser'].provider,
          model: nextConfig.appOverrides['stock-analyser']?.model ?? nextConfig.effective['stock-analyser'].model,
        },
        'budget-tracker': {
          provider: nextConfig.appOverrides['budget-tracker']?.provider ?? nextConfig.effective['budget-tracker'].provider,
          model: nextConfig.appOverrides['budget-tracker']?.model ?? nextConfig.effective['budget-tracker'].model,
        },
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load AI runtime configuration')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isOpen) {
      void load()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  if (!isOpen) return null

  const runMutation = async (key: string, action: (token: string) => Promise<unknown>) => {
    setSaving(key)
    setError(null)
    try {
      const token = idToken ?? await authService.getIdToken()
      if (!token) throw new Error('Authentication token is not available')
      setIdToken(token)
      await action(token)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI runtime configuration update failed')
    } finally {
      setSaving(null)
    }
  }

  const savePlatformDefault = () => runMutation(
    'platform',
    (token) => updatePlatformDefault(token, platformDraft satisfies AiRuntimeConfigUpdate),
  )

  const saveAppOverride = (appSlug: AiConfigAppSlug) => runMutation(
    appSlug,
    (token) => updateAppOverride(token, appSlug, appDrafts[appSlug] satisfies AiRuntimeConfigUpdate),
  )

  const resetOverride = (appSlug: AiConfigAppSlug) => runMutation(
    `${appSlug}:reset`,
    (token) => resetAppOverride(token, appSlug),
  )

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/50" onClick={onClose} />
      <section
        role="dialog"
        aria-modal="true"
        aria-label="AI Engine Settings"
        className="fixed inset-x-4 top-6 z-50 mx-auto max-h-[calc(100vh-3rem)] max-w-3xl overflow-y-auto rounded-lg border border-border bg-card shadow-2xl"
      >
        <div className="sticky top-0 flex items-center justify-between gap-3 border-b border-border bg-card px-4 py-3">
          <div>
            <h2 className="text-lg font-semibold text-foreground">AI Engine Settings</h2>
            <p className="text-sm text-muted-foreground">Provider and model selection</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-surface2 hover:text-foreground"
            aria-label="Close AI Engine Settings"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="grid gap-5 p-4">
          {error ? <ErrorBanner message={error} /> : null}

          <div className="flex items-center justify-between gap-3">
            <div className="text-sm text-muted-foreground">
              {loading ? 'Loading current configuration' : 'Current configuration'}
            </div>
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading || saving !== null}
              className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-foreground hover:bg-surface2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw className="size-4" />
              Refresh
            </button>
          </div>

          <section className="grid gap-3 border-b border-border pb-5">
            <div>
              <h3 className="font-semibold text-foreground">Platform Default</h3>
              <p className="text-sm text-muted-foreground">Used when an app override is not set.</p>
            </div>
            <SummaryRow
              label="current"
              provider={config?.platformDefault?.provider}
              model={config?.platformDefault?.model}
              source={config?.platformDefault ? 'platform_default' : undefined}
            />
            <ConfigSelects
              value={platformDraft}
              supportedModels={supportedModels}
              disabled={loading || saving !== null}
              onChange={setPlatformDraft}
            />
            <div>
              <button
                type="button"
                onClick={savePlatformDefault}
                disabled={loading || saving !== null}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Save className="size-4" />
                Save platform default
              </button>
            </div>
          </section>

          {(Object.keys(APP_LABELS) as AiConfigAppSlug[]).map((appSlug) => {
            const effective = config?.effective[appSlug]
            const override = config?.appOverrides[appSlug]
            return (
              <section key={appSlug} className="grid gap-3 border-b border-border pb-5 last:border-b-0 last:pb-0">
                <div>
                  <h3 className="font-semibold text-foreground">{APP_LABELS[appSlug]}</h3>
                  <p className="text-sm text-muted-foreground">
                    {override ? 'This app has an override.' : 'This app inherits from default or fallback.'}
                  </p>
                </div>
                <SummaryRow
                  label="effective"
                  provider={effective?.provider}
                  model={effective?.model}
                  source={effective?.source}
                />
                <SummaryRow
                  label="override"
                  provider={override?.provider}
                  model={override?.model}
                />
                <ConfigSelects
                  value={appDrafts[appSlug]}
                  supportedModels={supportedModels}
                  disabled={loading || saving !== null}
                  onChange={(value) => setAppDrafts((drafts) => ({ ...drafts, [appSlug]: value }))}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => saveAppOverride(appSlug)}
                    disabled={loading || saving !== null}
                    className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Save className="size-4" />
                    Save app override
                  </button>
                  <button
                    type="button"
                    onClick={() => resetOverride(appSlug)}
                    disabled={!override || loading || saving !== null}
                    className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-foreground hover:bg-surface2 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <RotateCcw className="size-4" />
                    Reset override
                  </button>
                </div>
              </section>
            )
          })}
        </div>
      </section>
    </>
  )
}
