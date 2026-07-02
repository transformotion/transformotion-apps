# UI Patterns

**Component conventions, tabs, visual behaviour.** v0 owns this — Claude Code should not deviate without flagging. Documented here so Claude Code knows what to expect when wiring up the backend.

## App shell

The Budget Tracker is one of several apps on the Transformotion platform. It shares:

- The platform header and navigation
- The shared auth flow
- The launchpad entry point at `apps.transformotion.com.au`

The app itself lives at `apps.transformotion.com.au/budget`.

The visual design — colour scheme, typography, theme (light/dark), component style — is v0's creative domain. The app should feel like a sibling to the Stock Analyser; the two apps sharing a consistent design language is desirable but left to v0's judgement.

## Tabs

The app has **6 tabs**, in this order:

1. **Transactions** — filterable list
2. **Summary** — monthly financial summary
3. **Budget** — set budget amounts
4. **Cashflow** — charts and flow visualisation
5. **Rules** — rules engine debugger + custom rules editor
6. **Review** — AI-assisted review queue

### 1. Transactions tab

- Filterable transaction list
- **Filters (all stackable):**
  - Category pills (multi-select)
  - Month dropdown
  - Source dropdown (CSV filename)
  - Three-way toggle: **All / Personal / Business**
- **Row contents:**
  - Date
  - Description (with 💼 badge if business)
  - Amount (green positive, red negative)
  - Category pill
  - Subcategory text
  - Actions: 💼 toggle, Learn rule, Edit
- **Uncategorised rows** show with a warning-tinted background
- **Bulk selection** — select multiple, apply action (categorise / flag as business / delete)
- **"AI Review (N)"** button appears in header when uncategorised transactions exist
- **"💼 Business (N)" export** button appears when business-flagged transactions exist — downloads CSV

### 2. Summary tab

- Month selector pills at top
- **Position card** — income vs expenses vs net, coloured status
- **Expandable category cards** — each shows:
  - Category name
  - Budget amount (monthly)
  - Actual amount
  - Variance (% and $)
  - Expand to reveal subcategories
  - Expand subcategory to reveal the contributing transactions
- **Separate amber Projects section** at the bottom — below-the-line capital spend tracked against lump-sum budgets with progress bars

### 3. Budget tab

- Category sections, each with subcategory rows
- Each row:
  - Subcategory name
  - Frequency selector (weekly / fortnightly / monthly / quarterly / annually)
  - Amount input
  - Computed monthly equivalent (shown alongside)
- **Separate Projects section** at the bottom — lump-sum budget input per project category with progress bar

### 4. Cashflow tab

Four visualisations, stacked vertically:

1. **Monthly trend line chart** — income vs expenses vs net, last 12 months
2. **Category bar chart** — current month actuals vs budget per category
3. **Top overspend chart** — worst-performing subcategories this month
4. **Sankey diagram** — income sources → Total Income → expense categories → subcategories

### 5. Rules tab

- **Test input at top** — paste any description, see which rule matches
- **Custom rules table** — match, category, subcategory, learned, delete. Add new rule at bottom.
- **Collapsible built-in rules section** — read-only, grouped by category

### 6. Review tab

The AI review queue. Shows:

- Status indicator (idle / running batch N of M / complete)
- Uncategorised transaction rows with AI suggestions
- Per row:
  - Transaction (date, description, amount)
  - AI-suggested category + subcategory
  - AI reason (1 sentence)
  - Actions: ✓ confirm, ✗ reject, ✎ override
- **Confirm all** button at top
- **Apply & close** button — saves all confirmed/overridden choices and closes the tab

## Component conventions

### Naming

- Components: `PascalCase.tsx`
- Files: match component name
- Shared components: `/components/shared/`
- Feature components: `/components/budget/{tab}/`
- Domain logic (pure functions): `/lib/domain/budget/`

### Structure

Every component:
- Is a named export, default-exported for the top-level of each tab
- Accepts typed props — no `any`
- Uses Zustand stores via hooks — never reaches into adaptors directly
- Never calls `fetch` or storage primitives directly

### Styling

- Tailwind CSS preferred
- No inline styles except for dynamic values (e.g. progress bar width)
- Use CSS variables or a design token system for theming (to support light/dark and other theme variants)

### Interactions

- All mutations go through Zustand actions — never call adaptors from components
- Loading states must be visible for any action >200ms
- Errors surface as toasts (top right) — never blocking modals except for destructive confirmations
- Optimistic updates where safe (categorise, toggle business flag); pessimistic for destructive (delete)

## Accessibility

- Keyboard navigation throughout — every interactive element tabbable
- All icons have aria-labels
- Colour is never the sole indicator — amounts also have +/- prefix, not just green/red

## Mobile-first

- 375px is the baseline. All layouts must work at this width without horizontal scroll.
- Tabs collapse to a horizontal-scrolling strip on mobile
- Filters collapse to a "Filters (N)" button that opens a sheet
- Transaction rows stack info vertically on mobile, horizontal on desktop
- Charts are responsive — Sankey collapses to vertical orientation under 600px

## Forbidden patterns

v0 must not do any of the following. If one is required, update this contract first:

- Direct `fetch()` or `XMLHttpRequest` calls from components
- `localStorage` reads/writes outside the stub adaptor
- Hardcoded mock data in components (put it in the stub adaptor)
- Global state outside Zustand (no module-level `let`)
- Inline category/subcategory lists (always use the tree from settings)
- Any assumption that AI calls are synchronous or free
