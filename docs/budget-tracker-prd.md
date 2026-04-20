# Budget Tracker — Product Requirements Document
### For v0 UI Recreation + Claude Code AWS Integration

---

## 1. Context & Platform

The Budget Tracker is **App 2** on the Transformotion platform hosted at `apps.transformotion.com.au`. It must integrate seamlessly with the existing platform infrastructure:

- **Monorepo:** `github.com/transformotion/transformotion-apps`
- **Frontend:** React + Vite + TypeScript + Tailwind v4, lives at `apps/budget-tracker/`
- **Auth:** AWS Cognito (existing User Pool), protected by Cognito group `budget-app`
- **Backend:** API Gateway + Lambda, following same patterns as Stock Analyser (App 1)
- **Database:** DynamoDB, following naming convention `budget-tracker.<tablename>`
- **Deployment:** Same CI/CD pipeline — develop branch → dev, main → prod
- **Domain:** `apps.transformotion.com.au/budget`

Users: Steve (admin) and Liz (family group). Both have access to this app. Their data is **shared** (one household budget, not per-user scoped — use a shared `accountId`).

---

## 2. Brand & Design

### Colour Palette (match Stock Analyser exactly)
```
Background:       #0D1B2A
Card/surface:     #141720
Accent (teal):    #00C4B3
Secondary (gold): #E8A838
Success/positive: #22c87a
Danger/negative:  #f05656
Warning:          #f0a030
Primary text:     #e8eaf0
Muted text:       #6b7280
```

### Design Principles
- Dark theme only — matches Stock Analyser
- Mobile-first — frequently used on phone
- Clean and legible — lots of financial data
- Premium fintech aesthetic — consistent with Stock Analyser
- v0 has full creative freedom on layout — do not replicate the current UI
- Mobile: bottom tab navigation
- Desktop: sidebar or top nav

---

## 3. AWS Architecture (must match existing platform)

### Authentication
- Use existing Cognito User Pool (already deployed)
- Cognito group required: `budget-app`
- Auth via AWS Amplify (already configured in monorepo)
- Steve and Liz share one household data set — use shared `accountId`, not per-user scoping

### Backend Lambda Functions (new — follow existing Stock Analyser patterns)
- `budget-categorise` — Anthropic API proxy for AI categorisation (key from Secrets Manager at `/prod/anthropic/api-key`)
- `budget-ai-review` — Anthropic API proxy with web_search tool enabled
- `budget-transactions` — CRUD for transactions
- `budget-rules` — CRUD for custom rules
- `budget-settings` — CRUD for budget amounts, frequencies, project budgets, custom categories

### DynamoDB Tables (new — follow naming convention)
```
budget-tracker.transactions    PK: accountId,  SK: transactionId
budget-tracker.rules           PK: accountId,  SK: ruleId
budget-tracker.settings        PK: accountId,  SK: settingKey
```

Settings keys: `budgetOverrides`, `budgetFreqs`, `customCategories`, `projectBudgets`

### Data Migration (first login)
- Offer one-click migration from browser localStorage to DynamoDB
- Idempotent — safe to run multiple times
- localStorage keys: `transactions`, `custom-rules`, `budget-overrides`, `budget-freqs`, `custom-categories`, `project-budgets`

---

## 4. Data Model

### Transaction
```typescript
{
  _id: number
  date: string           // DD/MM/YYYY
  amount: string         // negative = expense, positive = income or refund
  description: string
  category: string
  subcategory: string
  file: string           // source CSV filename
  _manual: boolean       // user manually set — rules will not overwrite
  _business: boolean     // business expense — excluded from personal P&L
}
```

### Custom Rule
```typescript
{
  match: string          // keyword or regex pattern, case-insensitive
  category: string
  subcategory: string
  learned: boolean       // created via Learn button on a transaction
}
```

### Settings stored as key/value:
- `budgetOverrides` — `{ [subcategory]: monthlyAmount }` — NOTE: -1 means deleted (tombstone), NOT 0. Zero is a valid budget amount.
- `budgetFreqs` — `{ [subcategory]: "weekly"|"fortnightly"|"monthly"|"quarterly"|"annually" }`
- `customCategories` — `{ [category]: string[] }`
- `projectBudgets` — `{ [projectCategory]: totalLumpSum }`

---

## 5. Category Structure

### Standard Categories (included in monthly P&L)
```
Income: Your take-home pay, Your partner's take-home pay, Bonuses / overtime,
  Income from savings and investments, Child support received,
  School fees reimbursement, Rent (investment property), Other income

Home & utilities: Mortgage / rent, Water, Gas, Electricity, Mobile, Internet,
  Streaming Services, Home improvements & Maintenance, Furniture & appliances,
  Council rates, Body corporate fees, Kierans Mobile, Ellas Mobile

Financial & Insurance: Savings, Investments & super contributions, Charity donations,
  Paying off debt, Credit card interest, Other loans, Car loan,
  Home & contents insurance, Health insurance, Car insurance,
  Personal & life insurance, Transfer, Capital purchases

Groceries: Supermarket, Deli & bakery, Fruit & veg market,
  Cleaning products, Toiletries, Pet food

Medical, personal & education: Doctors & medical, Medicines & pharmacy,
  Glasses & eye care, Dental, Education, Computers & gadgets, Sports & gym,
  Clothing & shoes, Cosmetics, Hair & beauty, Shopping, Hobbies,
  Pet care / vet / pet insurance

Eating-out & Entertainment: Coffee & tea, Lunches bought, Take-away & snacks,
  Drinks & alcohol, Restaurants, Bars & clubs, Movies shows & music,
  Books newspapers & magazines, Celebrations & gifts, Holidays

Car & Transport: Petrol, Road tolls & parking, Repairs & maintenance,
  Rego & licence, Uber & taxi, Public Transport, Airfares

Children: Children Clothing, Childcare, Babysitting, School fees, School uniforms,
  Excursions, Other school needs, Children Sports & activities, Toys,
  Child support payment
```

### Project Categories (excluded from P&L — lump sum budget tracking)
```
Renovations: Planning & design, Building & labour, Materials & supplies,
  Fixtures & fittings, Appliances, Landscaping & outdoor, Other renovation costs
```

### Also excluded from P&L:
- Any transaction with subcategory = "Transfer"
- Any transaction with subcategory = "Capital purchases"
- Any transaction with `_business: true`

---

## 6. Rules Engine

**Priority order:** Custom rules first, built-in rules second. First match wins.
Custom rules ALWAYS beat built-in rules — this is how users override incorrect categorisation.

**Matching:** Case-insensitive regex. Normalise whitespace before matching: `.replace(/\s+/g, " ").trim()`

**Reference to `customRules` in event handlers:** Use `useRef` to avoid stale closures — `customRulesRef.current = customRules` on every render.

### Built-in Rules (~45 rules, listed in priority order)
```
Transfers (highest priority):
  /payment thank/i → Financial & Insurance > Transfer
  /credit card payment|cc payment|visa payment|anz credit|mastercard payment/i → Financial & Insurance > Transfer
  /^(from|to) .*(internal transfer|linked account)/i → Financial & Insurance > Transfer
  /hawkins/i → Financial & Insurance > Transfer

Groceries:
  /woolworths|coles|aldi|ww metro|mega fresh/i → Groceries > Supermarket
  /bakers delight|wellington bakery|rainbow beach bakery|brumby|sg bakery|delifish/i → Groceries > Deli & bakery

Take-away:
  /mcdonald|kfc|subway|nandos|guzman|domino|uber.*eats|doordash|donut king|zambrero|oporto|red rooster|hungry jacks|pizza hut/i → Eating-out & Entertainment > Take-away & snacks

Coffee:
  /coffee|cafe|espresso|backstreet cafe|jamoke|micasa|holliday coffee|rock hop|black fox|somewhere over coffee|the pocket espresso|wishlist coffee|gun cotton|sushi hub|container by|boost|banjos/i → Eating-out & Entertainment > Coffee & tea

Drinks — bottleshops only:
  /bws|liquorland|dan murphy|vintage cellars|first choice liquor|aldi liquor/i → Eating-out & Entertainment > Drinks & alcohol
  /pomona distilling|noosa chocolate/i → Eating-out & Entertainment > Drinks & alcohol

Bars & clubs — venues only (NOT bottleshops):
  /brunswick hotel|alh venues|maroochy rsl|rose.*crown|boatshed|little parliament|deck sea salt|dock mooloolaba|beach bar|chancellor tavern|mammoth|green at tanawha/i → Eating-out & Entertainment > Bars & clubs
  /bwlngnrec|bwling|bowlsclub|bowling rec|bowling club/i → Eating-out & Entertainment > Bars & clubs
  /rugby|football club|soccer club|netball club|cricket club/i → Eating-out & Entertainment > Bars & clubs

Restaurants:
  /restaurant|thai|vietnamese|an nam|bombay bliss|walter.*diner|spaghetti|riba kai|playa|mebami|forest blend|springbok/i → Eating-out & Entertainment > Restaurants

Entertainment:
  /spotify|netflix|disney plus|hbomax|kayo|hubbl|audible|amazon prime|amznprime|apple.*bill|microsoft.*365/i → Eating-out & Entertainment > Movies shows & music
  /event cinema|event kawana|qtix|ticketek|ticketmaster|moshtix|humanitix|aussie world|bli bli water|surf life|pickleb/i → Eating-out & Entertainment > Celebrations & gifts
  /booking\.com|hotel at booking|gorge view|thekinkinwood|kings beach hotel/i → Eating-out & Entertainment > Holidays

Transport:
  /ampol|liberty tanawha|united bethania|caltex/i → Car & Transport > Petrol
  /linkt|parking|southbank carpark|secure parking|transportmainrds|sper qld/i → Car & Transport > Road tolls & parking
  /uber.*trip|taxi/i → Car & Transport > Uber & taxi
  /qantas|jetstar/i → Car & Transport > Airfares
  /cars on booking|garry cricks/i → Car & Transport > Repairs & maintenance
  /maroochydore state hig/i → Car & Transport > Rego & licence

Home & utilities:
  /agl sales|agl energy/i → Home & utilities > Electricity
  /telstra|vodafone|spintel/i → Home & utilities > Mobile
  /sunshine coast regiona/i → Home & utilities > Council rates
  /unitywater|unity water/i → Home & utilities > Water
  /bunnings|spotlight|harris scarfe|pomona true value/i → Home & utilities > Home improvements & Maintenance

Financial:
  /youi|suncorp insurance/i → Financial & Insurance > Car insurance
  /racq|nrma|aami/i → Financial & Insurance > Car insurance
  /medibank|bupa|hcf|hbf|ahm health/i → Financial & Insurance > Health insurance
  /interest charge/i → Financial & Insurance > Credit card interest

Computers (note: category is Medical not Financial):
  /mcafee|godaddy|adobe|bandify/i → Medical, personal & education > Computers & gadgets
  /claude\.ai|anthropic/i → Medical, personal & education > Computers & gadgets
  /officeworks/i → Medical, personal & education > Computers & gadgets
  /harvey norman|jb hi.fi|apple store|samsung/i → Medical, personal & education > Computers & gadgets
  /canva/i → Medical, personal & education > Computers & gadgets
  /amazon|amzn/i → Medical, personal & education > Shopping
  /google.*play|apple.*itunes|itunes/i → Eating-out & Entertainment > Movies shows & music

Personal:
  /fitstop|goodlife|gym/i → Medical, personal & education > Sports & gym
  /amino z/i → Medical, personal & education > Sports & gym
  /glow up|galaxy nail|orchid massage|coastal aesthetic|the body shop|mecca brands/i → Medical, personal & education > Hair & beauty
  /lskd|cotton on body|decjuba|bonds sunshine|forever new/i → Medical, personal & education > Clothing & shoes
  /myer|david jones|target|kmart/i → Medical, personal & education > Shopping
  /rebel sport|city beach|surf stitch|the iconic/i → Medical, personal & education > Clothing & shoes
  /terry white|chemist|pharmacy|livelife pharmacy|chemist warehouse/i → Medical, personal & education > Medicines & pharmacy
  /specsavers/i → Medical, personal & education > Glasses & eye care
  /suncoast health|dietitian|hayley mary/i → Medical, personal & education > Doctors & medical

Children:
  /sunny sloths/i → Children > Toys

Income:
  /salary|payroll|employer/i → Income > Your take-home pay

Renovations:
  /architect|draftsman|building designer|town planner|interior design/i → Renovations > Planning & design
```

---

## 7. CSV Import

### Supported formats
1. **ANZ with header** — columns: Date, Description (or "Original Description"), Amount
2. **ANZ without header** — col 0 = date (DD/MM/YYYY), col 1 = amount, col 2 = description
3. **Macquarie Bank** — separate Debit/Credit columns (debits = expenses negative, credits = income positive)

### Detection
If first cell matches date pattern `^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$` → headerless format. Otherwise parse first row as header.

### Amount format
Amounts may be quoted strings: `"-62.14"` — strip quotes and parse as float.

### Duplicate prevention
Key = `${date}|${amount}|${description}` — skip if already exists in loaded transactions.

### On upload flow
1. Parse CSV → new transactions
2. Apply rules (custom first, then built-in)
3. Show count of new transactions loaded in status bar
4. Batch remaining uncategorised to AI (50 per batch)
5. Show "Categorising N transactions with AI..." status
6. Update transactions as AI results come back

---

## 8. Feature Details by Tab

### 8.1 Transactions Tab

Filters: category pills, subcategory pills, month dropdown, source dropdown, All/Personal/Business 3-way toggle, clear filters button, live transaction count.

Table: checkbox, date, description (+💼 badge), amount (green if positive), category pill, subcategory, source (toggle), actions.

Row backgrounds: uncategorised = warning, business = distinct, selected = accent.

Per-row (view mode): 💼 toggle, Edit button, ↺ re-run rules button (only if categorised).

Per-row (edit mode): category dropdown, subcategory dropdown, Learn button (saves + creates rule from first 3 words), Done button, Delete button.

Bulk bar (shown when rows selected): category dropdown, subcategory dropdown, Apply to N, Clear selection, 🗑 Delete N.

Header: Export CSV, 💼 Export Business (when flagged transactions exist), AI Review (N) (when uncategorised exist), Clear all, Upload CSV.

**CSV export must use data URI, not createObjectURL** (CSP restriction in sandboxed environments).

**No window.confirm** — use inline confirmation state instead.

### 8.2 Summary Tab

Month selector pills at top (All months + each month).

Position card: Over/Under budget, Income actual/budget, Expenses actual/budget, Net, % of income progress bar.

Income card (success colour): total budget vs actual, expandable subcategories, subcategories clickable to show transactions. Positive amounts in drilldown = green with "-$" prefix and "(refund/reimbursement)" label.

Expense category cards (one per standard category, excludes project categories): budget, actual, vs budget %, expandable subcategories with drilldown.

Projects & Capital Expenditure card (warning/gold colour): shown separately at bottom, amber styling, subcategories clickable for drilldown.

Uncategorised warning banner.

### 8.3 Budget Tab

Monthly position card (income/expenses/net).

Update from actuals button — sets budgets to monthly average of loaded transaction data.

Category sections (excludes project categories): per subcategory row with rename (✏️), delete (🗑 hover-only), frequency dropdown, amount input. onKeyDown stopPropagation on inputs to prevent delete key triggering delete button. onChange: if NaN, return (don't save). Reset button on modified rows. Add subcategory at bottom.

Delete modal: shows affected transaction count, transfer-to dropdown before deletion. Tombstone value is -1 (NOT 0).

Deleted subcategories section at bottom with Restore buttons.

Projects & Capital Expenditure section (amber): lump-sum budget input per project, progress bar, per-subcategory budget line items with individual inputs and "X spent" display.

### 8.4 Cashflow Tab

Monthly trend line chart (Income/Expenses/Net — needs 2+ months).
Category actuals vs budget horizontal bar chart (red = over).
Top overspend subcategories.
Budget flow Sankey diagram.

### 8.5 Rules Tab

Test a transaction: input, shows all matching rules in priority order, winner highlighted. Each result badge (Custom/Built-in) is clickable — jumps to that rule in the table with edit mode pre-opened.

Add rule: pattern input, ? help button (pattern syntax modal), category, subcategory, Add.

Re-apply all rules: runs rules on all transactions. If match: update + clear _manual. If no match: keep existing category, just clear _manual. Shows feedback count.

Custom rules table with inline editing.

Built-in rules (collapsible) with Edit button — saves as custom override.

Pattern help modal: simple keyword, OR (|), wildcard (.*) examples.

### 8.6 AI Review Tab

Triggered by AI Review button in header.
Sends uncategorised transactions to Claude API (batches of 20) with web_search tool enabled.
Results stream in with: date, description, amount, suggested category/subcategory, reason.
Per-result: ✓ Confirm, ✗ Reject, category/subcategory override dropdowns.
Bulk: Confirm all, Apply & close.

---

## 9. Critical Technical Requirements

These caused significant bugs in the current version:

1. **No IIFEs in JSX** — Babel rejects `(() => {})()` inside JSX. Compute all values above the return statement.

2. **No window.confirm** — Blocked in sandboxed environments. Use inline UI for confirmations.

3. **CSV export must use data URIs** — `data:text/csv;charset=utf-8,` + `encodeURIComponent(csv)`. NOT `URL.createObjectURL`.

4. **Custom rules must always win** — Array passed to applyRules must be `[...customRules, ...BUILTIN_RULES]`.

5. **Whitespace normalisation before matching** — `.replace(/\s+/g, " ").trim()` on both description and string patterns.

6. **Stale closure on customRules** — Use `useRef`: `customRulesRef.current = customRules` synced on every render. Use `customRulesRef.current` in event handlers and rule application.

7. **Tombstone is -1, not 0** — Zero is valid. -1 means deleted subcategory.

8. **Re-apply preserves existing categories** — Only update when a rule matches. Never clear a category when no rule matches.

9. **Debounced transaction saves** — 800ms debounce, save only 8 essential fields: `_id, date, amount, description, category, subcategory, file, _manual`.

10. **Load order** — Load both transactions and custom rules, THEN re-run rules on transactions. Otherwise rules will be empty when transactions are re-processed.

---

## 10. v0 Prompt

```
Design a mobile-first personal budget tracking app for a household (two shared users).
Part of the Transformotion platform — a professional business tools suite.

App name: Budget Tracker
Platform: Transformotion (apps.transformotion.com.au)

Colour palette (use exactly):
- Background: #0D1B2A
- Card/surface: #141720
- Accent teal: #00C4B3
- Secondary gold: #E8A838
- Success: #22c87a
- Danger: #f05656
- Warning: #f0a030
- Primary text: #e8eaf0
- Muted text: #6b7280

Dark theme only. Mobile-first — show 375px view first, then 1280px desktop.
Premium fintech aesthetic — consistent with a dark-themed stock analyser on the same platform.
The two apps should feel like siblings.

The app has 6 tabs: Transactions, Summary, Budget, Cashflow, Rules, Review.

Key screens to design:

1. Transactions — filterable list. Filters: category pills, month dropdown,
   source dropdown, All/Personal/Business toggle. Rows show date, description
   (💼 badge for business), amount (green positive, red negative), category pill,
   subcategory, actions. Uncategorised rows have warning background. Bulk selection.

2. Summary — monthly financial summary. Month selector pills. Position card
   (income vs expenses vs net, coloured status). Expandable category cards
   (budget vs actual vs % variance). Each category → subcategories → transactions.
   Separate amber Projects section for below-the-line capital spend.

3. Budget — set budget amounts. Category sections with subcategory rows: name,
   frequency selector (weekly/fortnightly/monthly/quarterly/annually), amount input.
   Separate Projects section with lump-sum budget inputs and progress bars.

4. Cashflow — monthly trend line chart, category bar chart (actuals vs budget),
   top overspend chart, Sankey budget flow diagram.

5. Rules — test input at top to debug which rules match a description.
   Custom rules table. Collapsible built-in rules section.

6. Review — AI review queue. Uncategorised transactions with AI suggestions,
   confirm/reject/override per row, confirm all, apply & close.

Design constraints:
- Mobile: bottom tab navigation
- Desktop: sidebar or top nav
- Financial numbers must be very legible — large, clear colour coding
- Make your own UX decisions — do not copy any existing layout
- Use realistic Australian household budget placeholder data
- Surprise me with the design
```

---

*End of PRD — v1.0*
