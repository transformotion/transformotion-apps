# v0 Project Instructions — Budget Tracker (transformotion-apps-b8)

**Paste this into v0's project instructions. Replace any existing project-level instructions.**

---

## What this project is

This is the **Transformotion platform UI** — a Next.js app containing two products:
- **Budget Tracker** (`components/budget-tracker/`, `app/budget-tracker/`)
- **Stock Signal Analyser** (`components/stock-signal/`, `app/stock-signal/`)

A separate backend repo (`transformotion/transformotion-apps`) owns all Lambda functions, DynamoDB tables, and CDK infrastructure. v0 owns the UI only.

---

## Documents — where to find everything

All specifications are committed to this repo. **Read before building.**

| Document | Path | What it contains |
|---|---|---|
| **PRD** — start here | `docs/budget-tracker-prd.md` | Full product spec: colour palette, all 6 tab UX details, data model, category tree, 65+ built-in rules, CSV import logic, 10 critical tech gotchas |
| **Data models** | `contracts/budget-tracker/data-models.md` | Canonical TypeScript types — Transaction, CustomRule, BudgetSettings, CategoryTree, all AI response shapes |
| **API endpoints** | `contracts/budget-tracker/api-endpoints.md` | Every backend endpoint, request/response shapes, error codes |
| **State management** | `contracts/budget-tracker/state-management.md` | BudgetRepository adaptor interface; how stub → real AWS swap works |
| **AI prompts** | `contracts/budget-tracker/ai-prompts.md` | Verbatim system prompts for the 3 AI features |
| **UI patterns** | `contracts/budget-tracker/ui-patterns.md` | Interaction patterns, layout guidance, component specs |
| **AWS infrastructure** | `contracts/budget-tracker/aws-infrastructure.md` | Deployed table names, Lambda names, API Gateway URL, Cognito client |
| **Changelog** | `contracts/budget-tracker/changelog.md` | Contract change log — use this to flag gaps or changes |

**Recommended read order:** PRD → data-models → state-management → build.

---

## What you must comply with

### 1. PRD (`docs/budget-tracker-prd.md`)

The PRD is your primary reference. Check the relevant section before touching any feature.

**Colour palette (§2) — use exactly:**
```
Background:   #0D1B2A      Card/surface: #141720
Accent teal:  #00C4B3      Gold:         #E8A838
Success:      #22c87a      Danger:       #f05656
Warning:      #f0a030      Primary text: #e8eaf0
Muted text:   #6b7280
```
No other colours. Dark theme only.

**Tab specs (§8):**
Each tab has a detailed spec. Read §8.1–8.6 before working on that tab:
- §8.1 Transactions — filters, row actions, bulk bar, edit mode, CSV upload
- §8.2 Summary — month selector, position card, category cards, drilldown to transactions
- §8.3 Budget — subcategory rows with frequency + amount inputs, tombstone (-1) for deleted, Projects section
- §8.4 Cashflow — trend chart, category bar chart, Sankey diagram
- §8.5 Rules — test input, custom rules table, built-in rules (collapsible)
- §8.6 Review — AI review queue, confirm/reject/override per row

**Built-in rules (§6):**
65+ rules covering groceries, coffee, takeaway, bars, restaurants, transport, utilities, financial, computers, personal, children. These live in `components/budget-tracker/data/` or `lib/domain/budget-tracker/`. Do not modify the list without flagging it. Priority: custom rules first (always win), built-in second. Case-insensitive regex matching; normalise whitespace before matching.

**CSV import (§7):**
Three formats: ANZ with header, ANZ headerless, Macquarie (separate debit/credit columns). Dedup key: `${date}|${amount}|${description}`. Upload flow: parse → apply rules → AI categorise uncategorised (50 per batch).

**Critical technical requirements (§9):** These caused real bugs — read every one:
1. No IIFEs in JSX — compute values above the return statement
2. No `window.confirm` — use inline confirmation UI
3. CSV export via data URI (`data:text/csv;charset=utf-8,...`) NOT `createObjectURL`
4. Custom rules always beat built-in — pass `[...customRules, ...BUILTIN_RULES]`
5. Whitespace normalise before regex match — `.replace(/\s+/g, " ").trim()`
6. `customRules` stale closure — use `useRef`, sync on every render, use `.current` in event handlers
7. Tombstone is `-1` NOT `0` — zero is a valid budget amount
8. Re-apply rules preserves existing categories — only update when a rule matches; never clear
9. Debounced transaction saves — 800ms debounce, save only 8 fields
10. Load order — load transactions AND rules, THEN re-run rules

---

### 2. Data models (`contracts/budget-tracker/data-models.md`)

- **Never invent or guess types.** Every type must appear in this file.
- If a type is missing, flag it via `contracts/budget-tracker/changelog.md` — do not silently create it.
- Key types: `Transaction`, `CustomRule`, `BuiltinRule`, `BudgetSettings`, `CategoryTree`, `CSVMapping`, `AiCategoriseResponse`, `AiReviewResponse`, `AiCsvAnalysisResponse`.
- Note: the server assigns `transactionId: string` (UUID). The prototype used `_id: number`. Your stub may use either; the real adaptor will use UUIDs.

---

### 3. State management (`contracts/budget-tracker/state-management.md`)

The adaptor interface is the contract between the Zustand store and persistence:

```
Component → store action → BudgetRepository interface → stub or real adaptor
```

Your stub repositories (`lib/repositories/budget-tracker/*.ts`) must implement every method in the `BudgetRepository` interface — including methods you haven't built UI for yet. This allows Claude Code to swap in the real adaptor without touching your components.

Required methods: `listTransactions`, `bulkUpsertTransactions`, `updateTransaction`, `deleteTransaction`, `listRules`, `createRule`, `updateRule`, `deleteRule`, `getSettings`, `updateSettings`, `generateBusinessExportCsv`, `migrateFromLocalStorage`.

Your AI stub (`lib/services/ai/mock-ai.ts`) must return data shaped like `AiCategoriseResponse`, `AiReviewResponse`, `AiCsvAnalysisResponse` from `data-models.md`.

**Do not change the interface without updating the contract file.** The backend Lambda implementations depend on it.

---

### 4. UI patterns (`contracts/budget-tracker/ui-patterns.md`)

Read this before building any component. Contains:
- Interaction patterns: edit mode, bulk selection, confirmation flows (no `window.confirm`)
- Layout guidance: mobile bottom tabs, desktop sidebar
- Component specs: filter pills, category cards, drilldown behaviour

---

### 5. AI prompts (`contracts/budget-tracker/ai-prompts.md`)

- Stubs do NOT use these prompts — return canned mock responses instead.
- Use this file to understand AI response shapes so your stubs return realistic data.
- Never copy prompt text into client-side code — prompts run server-side only.

---

### 6. AWS infrastructure (`contracts/budget-tracker/aws-infrastructure.md`)

- Reference only — describes what's deployed.
- When naming environment variables, match what's here so Claude Code can hand off the values without renaming.
- API base: `NEXT_PUBLIC_API_BASE_URL` → `https://<api-id>.execute-api.ap-southeast-2.amazonaws.com/dev/api/budget/v1`

---

## Adaptor pattern — summary

```
Component
    ↓
Zustand store
    ↓
BudgetRepository interface  ← state-management.md defines this
    ↓
┌─────────────────────┬─────────────────────────┐
│  Stub (you build)   │  Real adaptor (Claude)  │
│  localStorage       │  API Gateway + DynamoDB │
│  instant, no auth   │  async, JWT auth        │
└─────────────────────┴─────────────────────────┘
```

The store must never know which implementation it's calling. Environment variables control which adaptor loads. Your stub always loads in this repo.

---

## Forbidden patterns

- `fetch()` or network calls from components or store actions
- `localStorage` reads/writes outside `lib/repositories/`
- Types not in `contracts/budget-tracker/data-models.md`
- AI prompt text in client-side code (server-side only)
- Category lists or default budgets hardcoded inside components
- `window.confirm` — inline UI only
- IIFEs inside JSX
- `URL.createObjectURL` for CSV export
- Colours not in the PRD §2 palette
- Imports crossing from budget-tracker into stock-signal or vice versa

---

## Division of labour

| What | Owner |
|---|---|
| UI components, layouts, styling | v0 |
| Zustand stores | v0 |
| Stub/localStorage repositories | v0 |
| Real AWS adaptor (API calls) | Claude Code |
| Real Cognito auth | Claude Code |
| Lambda functions | Claude Code |
| Contracts (source of truth) | Shared — master in `transformotion/transformotion-apps` |

We meet at the `BudgetRepository` interface. Respect that boundary and the swap to production requires zero component changes.

---

## When contracts need changing

1. Edit the contract file in `contracts/budget-tracker/`
2. Add a changelog entry in `contracts/budget-tracker/changelog.md`
3. Flag it — Claude Code will sync the change back to the master repo

Do not silently change types or interfaces. The backend depends on them.
