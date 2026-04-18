# v0 Project Instructions — Budget Tracker (transformotion-apps-b8)

**Paste this into v0's project instructions. Replace any existing project-level instructions.**

---

## What this project is

This is the **Transformotion platform UI**, built in Next.js. It contains two products:
- **Budget Tracker** (`components/budget-tracker/`, `app/budget-tracker/`)
- **Stock Signal Analyser** (`components/stock-signal/`, `app/stock-signal/`)

A separate backend repo (`transformotion/transformotion-apps`) owns all Lambda functions, DynamoDB tables, and CDK infrastructure. Your job is the UI only.

## Golden rules

1. **Read the contracts before building.** Every type, endpoint, AI prompt, and data shape is documented in `contracts/budget-tracker/`. Never invent or guess.

2. **Never make direct API calls from components.** All data access goes through the Zustand store → repository/adaptor layer. Components call store actions only.

3. **Never put `localStorage` reads or writes in components.** That belongs in the stub adaptor (`lib/repositories/budget-tracker/`).

4. **Never hardcode data inside components.** Categories, default budgets, built-in rules, prompts — all come from `lib/domain/budget-tracker/` or `contracts/budget-tracker/`.

5. **Types come from the contracts.** `contracts/budget-tracker/data-models.md` is the source of truth. If a type isn't there, flag it — don't create it silently.

6. **Contracts are read-only here.** The master copy lives in `transformotion/transformotion-apps`. If you need a contract change, note it in `contracts/budget-tracker/changelog.md` and flag it.

## What you're working on right now

I will always tell you which app and which feature I want:

> "Budget Tracker — update the Transactions tab to show a running balance column."

Work only in the named app's folders. Do not touch `components/stock-signal/` when working on Budget Tracker, and vice versa.

If I haven't named the app, ask — don't assume.

## Architecture at a glance

```
app/budget-tracker/page.tsx
    ↓
components/budget-tracker/budget-tracker-app.tsx
    ↓  (calls store actions)
stores/budget-tracker/use-budget-store.ts
    ↓  (calls repository)
lib/repositories/budget-tracker/
    ├── transaction-repository.ts   ← localStorage stub (your responsibility)
    ├── rules-repository.ts         ← localStorage stub
    └── settings-repository.ts      ← localStorage stub
```

The real AWS adaptors (swap localStorage for API calls) are delivered by Claude Code. Until they land, the stubs keep the UI fully functional.

## The adaptor interface

The stub repositories must implement the `BudgetRepository` interface from `contracts/budget-tracker/state-management.md`. When Claude Code delivers the real adaptor, it implements the same interface. Never change the interface without updating the contract.

## Key folders

| Folder | What lives there |
|---|---|
| `components/budget-tracker/` | All Budget Tracker UI |
| `components/budget-tracker/tabs/` | Tab-level page components |
| `components/budget-tracker/data/` | Static data (categories, built-in rules, default budgets) |
| `stores/budget-tracker/` | Zustand store |
| `lib/repositories/budget-tracker/` | localStorage stub adaptors |
| `lib/domain/budget-tracker/` | Domain logic (CSV parser, rules engine, P&L) |
| `lib/services/ai/` | AI service stub + (future) real adaptor |
| `lib/services/auth/` | Auth stub + (future) Cognito adaptor |
| `contracts/budget-tracker/` | Authoritative contracts — read before building |
| `components/ui/` | Shared shadcn/ui primitives — use these, don't invent |

## Styling rules

- Use the existing `components/ui/` primitives (Button, Card, Table, Dialog, etc.) — they implement the design system
- Dark theme with zinc/slate palette is the platform standard — do not introduce bespoke colours
- Tailwind only — no inline styles, no CSS modules
- For charts, use Recharts (already in the project)

## Forbidden patterns

- `fetch()` inside React components
- `localStorage` outside `lib/repositories/`
- Inline category lists, budget amounts, built-in rules (they're in `lib/domain/budget-tracker/data/`)
- Inline AI prompt text (it's in `contracts/budget-tracker/ai-prompts.md`)
- Types that contradict `contracts/budget-tracker/data-models.md`
- Importing between `components/budget-tracker/` and `components/stock-signal/`

## Two tools, one product

You own the UI. Claude Code owns the backend. We meet at the adaptor interface defined in `contracts/budget-tracker/state-management.md`. If you hold to that interface, Claude Code can swap the stub for real AWS calls without touching a single component.

Keep to your lane, read the contracts, and we stay in sync.
