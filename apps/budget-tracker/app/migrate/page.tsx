'use client'

import { useState, useRef } from 'react'

const STORAGE_KEYS = [
  'budget-tracker-transactions',
  'budget-tracker-custom-rules',
  'budget-tracker-builtin-rules',
  'budget-tracker-settings',
  'budget-tracker-transaction-filters',
] as const

interface ExportBundle {
  version: number
  exportedAt: string
  data: Partial<Record<(typeof STORAGE_KEYS)[number], unknown>>
}

interface ImportSummary {
  transactions: number
  customRules: number
  builtinRules: number
  hasSettings: boolean
  hasFilters: boolean
}

function parseSummary(bundle: ExportBundle): ImportSummary {
  const txns = bundle.data['budget-tracker-transactions']
  const rules = bundle.data['budget-tracker-custom-rules']
  const builtin = bundle.data['budget-tracker-builtin-rules']
  return {
    transactions: Array.isArray(txns) ? txns.length : 0,
    customRules: Array.isArray(rules) ? rules.length : 0,
    builtinRules: Array.isArray(builtin) ? builtin.length : 0,
    hasSettings: !!bundle.data['budget-tracker-settings'],
    hasFilters: !!bundle.data['budget-tracker-transaction-filters'],
  }
}

// Console snippet the user pastes into the old app
const EXPORT_SNIPPET = `
// Run this in the browser console at localhost:3000 (old budget tracker)
const keys = [
  'budget-tracker-transactions',
  'budget-tracker-custom-rules',
  'budget-tracker-builtin-rules',
  'budget-tracker-settings',
  'budget-tracker-transaction-filters',
];
const bundle = {
  version: 1,
  exportedAt: new Date().toISOString(),
  data: Object.fromEntries(
    keys.map(k => [k, JSON.parse(localStorage.getItem(k) || 'null')])
       .filter(([, v]) => v !== null)
  ),
};
const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
const a = document.createElement('a');
a.href = URL.createObjectURL(blob);
a.download = 'budget-tracker-export-' + new Date().toISOString().slice(0,10) + '.json';
a.click();
console.log('Export complete:', bundle.exportedAt);
`.trim()

export default function MigratePage() {
  const [bundle, setBundle] = useState<ExportBundle | null>(null)
  const [summary, setSummary] = useState<ImportSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [imported, setImported] = useState(false)
  const [snippetCopied, setSnippetCopied] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string) as ExportBundle
        if (!parsed.version || !parsed.data) throw new Error('Invalid export file')
        setBundle(parsed)
        setSummary(parseSummary(parsed))
        setError(null)
      } catch {
        setError('Could not parse the file. Make sure it was exported using the snippet above.')
      }
    }
    reader.readAsText(file)
  }

  function handleImport() {
    if (!bundle) return
    for (const key of STORAGE_KEYS) {
      const value = bundle.data[key]
      if (value !== undefined && value !== null) {
        localStorage.setItem(key, JSON.stringify(value))
      }
    }
    setImported(true)
  }

  async function copySnippet() {
    await navigator.clipboard.writeText(EXPORT_SNIPPET)
    setSnippetCopied(true)
    setTimeout(() => setSnippetCopied(false), 2000)
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground mb-1">Data Migration</h1>
          <p className="text-muted-foreground text-sm">
            Import your budget data from the previous app into this one.
          </p>
        </div>

        {/* Step 1 */}
        <div className="bg-card border border-border rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <span className="size-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">1</span>
            <h2 className="font-semibold text-foreground">Export from the old app</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Open <code className="text-primary">localhost:3000</code> in a tab, open the browser DevTools (F12), go to the <strong>Console</strong> tab, and paste this snippet:
          </p>
          <div className="relative">
            <pre className="bg-background border border-border rounded-lg p-4 text-xs text-muted-foreground overflow-x-auto whitespace-pre-wrap">
              {EXPORT_SNIPPET}
            </pre>
            <button
              onClick={copySnippet}
              className="absolute top-2 right-2 px-2 py-1 text-xs rounded bg-surface2 border border-border text-muted-foreground hover:text-foreground transition-colors"
            >
              {snippetCopied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            This downloads a <code>.json</code> file to your Downloads folder.
          </p>
        </div>

        {/* Step 2 */}
        <div className="bg-card border border-border rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <span className="size-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">2</span>
            <h2 className="font-semibold text-foreground">Upload the export file</h2>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".json"
            onChange={handleFile}
            className="hidden"
          />
          <button
            onClick={() => fileRef.current?.click()}
            className="w-full h-12 rounded-xl border border-dashed border-border hover:border-primary/50 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Click to choose the exported .json file
          </button>
          {error && (
            <p className="text-sm text-signal-red">{error}</p>
          )}
        </div>

        {/* Step 3 — preview + import */}
        {summary && bundle && !imported && (
          <div className="bg-card border border-border rounded-xl p-5 space-y-4">
            <div className="flex items-center gap-2">
              <span className="size-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">3</span>
              <h2 className="font-semibold text-foreground">Review and import</h2>
            </div>
            <p className="text-xs text-muted-foreground">
              Exported at: {new Date(bundle.exportedAt).toLocaleString()}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-background border border-border rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-foreground">{summary.transactions}</p>
                <p className="text-xs text-muted-foreground">Transactions</p>
              </div>
              <div className="bg-background border border-border rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-foreground">{summary.customRules}</p>
                <p className="text-xs text-muted-foreground">Custom rules</p>
              </div>
              <div className="bg-background border border-border rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-foreground">{summary.builtinRules}</p>
                <p className="text-xs text-muted-foreground">Built-in rule overrides</p>
              </div>
              <div className="bg-background border border-border rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-foreground">{summary.hasSettings ? '✓' : '—'}</p>
                <p className="text-xs text-muted-foreground">Budget settings</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Importing will overwrite any existing data in this app.
            </p>
            <button
              onClick={handleImport}
              className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors"
            >
              Migrate Now
            </button>
          </div>
        )}

        {/* Success */}
        {imported && summary && (
          <div className="bg-signal-green/10 border border-signal-green/25 rounded-xl p-5 space-y-3">
            <h2 className="font-semibold text-signal-green">Migration complete</h2>
            <p className="text-sm text-muted-foreground">
              {summary.transactions} transactions, {summary.customRules} custom rules, and your budget settings have been imported.
            </p>
            <a
              href="/"
              className="inline-block px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              Open Budget Tracker →
            </a>
          </div>
        )}
      </div>
    </div>
  )
}
