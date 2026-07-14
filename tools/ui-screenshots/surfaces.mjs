// Config-driven surface/state catalogue for the UI-review screenshot harness.
//
// Add a new surface = add a block here (NOT a new script). Add a new state = add an
// entry to a surface's `states[]`. The runner (capture.mjs) resets to a fresh page
// load before EACH state, replays `nav`, then the state's `actions`, then captures.
//
// Locator DSL (used by nav/actions/clip): one of
//   { role: ['switch', 'Warm Market'] }   getByRole(role, { name })
//   { text: 'some text' }                  getByText (substring; add exact:true for exact)
//   { label: 'aria-label' }                getByLabel
//   { testId: 'x' }                        getByTestId
//   { selector: 'div.foo', hasText: 'y', nth: 2 }  page.locator(selector).filter({ hasText }).nth(2)
//
// Action verbs: { click }, { fill, text }, { select, value }, { waitVisible },
//   { waitHidden }, { press: 'Enter' }, { wait: ms }.

export const app = {
  // Booted by capture.mjs unless --no-boot is passed. Run from the repo root.
  bootCommand: 'pnpm --filter @transformotion/stock-analyser dev',
  // Loaded from mock.env (keeps the app in mock mode; no real network, boots on a fresh clone).
  envFile: 'mock.env',
  baseURL: 'http://localhost:3000/stock-analyser/',
  port: 3000,
}

// A surface may set `app: budgetTrackerApp` to boot Budget Tracker (:3002) instead
// of the default Stock Analyser app. capture.mjs boots each distinct app once.
export const budgetTrackerApp = {
  bootCommand: 'pnpm --filter @transformotion/budget dev',
  envFile: 'mock.env',
  baseURL: 'http://localhost:3002/budget-tracker/',
  port: 3002,
}

export const surfaces = [
  {
    name: 'notifications-warm-toggles',
    description:
      'Settings → Notifications: M19 per-surface daily-warm toggles + per-type app-level banner. ' +
      'Mock mode auto-authenticates a site-admin persona, so the admin toggles render editable.',
    viewport: { width: 1440, height: 1800 },
    // Replayed after each fresh page load, before the per-state actions.
    nav: [
      { click: { role: ['button', 'Settings'] } },
      { waitVisible: { role: ['switch', 'Warm Market'] } },
    ],
    // The element captured (the Notifications card). Omit `clip` for a full-page shot.
    clip: { selector: 'div.space-y-5', hasText: 'Daily cache warming' },
    states: [
      {
        name: '01-default',
        // Fresh mock config = all surfaces ON. No actions.
        actions: [],
      },
      {
        name: '02-recs-disabled',
        // Market OFF → Recommendations toggle becomes disabled + dependency note.
        actions: [
          { click: { role: ['switch', 'Warm Market'] } },
          { waitVisible: { text: 'Recommendations warming requires Market warming' } },
        ],
      },
      {
        name: '03-mixed',
        // Metals + Portfolio OFF (Market stays ON) → per-type app-level banner appears.
        actions: [
          { click: { role: ['switch', 'Warm Metals'] } },
          { click: { role: ['switch', 'Warm Portfolio'] } },
          { waitVisible: { text: 'Portfolio notifications are currently disabled at the app level.' } },
        ],
      },
    ],
  },
  {
    name: 'notifications-run-history',
    description:
      'Settings → Notifications → Run history: M19 #579 error surfacing + Option-B skipped-ticker legibility, ' +
      'with the server-scoped detail-vs-summary tiers (mock site-admin+owner persona).',
    viewport: { width: 1440, height: 2400 },
    nav: [
      { click: { role: ['button', 'Settings'] } },
      { waitVisible: { text: 'Run history' } },
      { click: { text: 'Run history' } },        // expand the run-history section
      { waitVisible: { text: '2 errored' } },     // the partial run's summary line
    ],
    clip: { selector: 'div.rounded-xl', hasText: 'Run history' },
    states: [
      {
        name: '01-run-list',
        // The list: a healthy (Success) run + a Partial run showing "· 2 errored".
        actions: [],
      },
      {
        name: '02-partial-expanded',
        // Expand the Partial RUN ROW (its button name starts with the run date, vs the
        // section header which starts with "Run history") → OWNED account detail (error
        // reason + Option-B skipped ticker + member outcome) AND a NON-owned account as
        // admin summary-only (error reason, no member detail).
        actions: [
          { click: { testId: 'run-row-run-2026-07-03' } }, // the partial run (stable runId, tz-independent)
          { waitVisible: { text: 'analysis unavailable this run' } }, // owner-detail skipped line
          { waitVisible: { text: 'Member detail visible to account owners' } }, // admin summary-only lock
        ],
      },
    ],
  },
  {
    name: 'analyser-newly-listed-degrade',
    description:
      'Analyser: #603 newly-listed / thin-data ticker (SPCX) → the distinguished insufficient-data ' +
      'state (honest banner + "price data unavailable" note) instead of a 502 error.',
    viewport: { width: 1440, height: 2200 },
    nav: [
      { click: { role: ['button', 'Analyser'] } },
      { waitVisible: { placeholder: 'Search ticker or company...' } },
    ],
    // Full-page shot (no clip): search box → degraded header → banner.
    states: [
      {
        name: '01-insufficient-data',
        actions: [
          { fill: { placeholder: 'Search ticker or company...' }, text: 'SPCX' },
          { click: { role: ['button', /Analyse SPCX/] } },
          { waitVisible: { text: 'Insufficient data for analysis' } },
        ],
      },
    ],
  },
  {
    name: 'bt-review-accept-writes-rule',
    app: budgetTrackerApp,
    description:
      'Budget Tracker → Review: accept-writes-rule. The PENCIL opens an inline rule ' +
      'preview (edit then Save); the green TICK is one-click — it saves the suggested ' +
      'rule (_manual:false) and cascades onto other pending items in one step. The ' +
      'cascade group card shows the rule name AND its pattern. Mock mode seeds ' +
      'uncategorised transactions (incl. three COLES rows) so the cascade is demonstrable.',
    viewport: { width: 1440, height: 2000 },
    // Reach the Review tab (replayed before each state's actions).
    nav: [
      { click: { role: ['button', 'Review'] } },
      { waitVisible: { role: ['button', 'Review with AI'] } },
    ],
    // Full-page shots (no clip).
    states: [
      {
        // 1. Pencil → inline rule preview open, prefilled.
        name: '01-preview-open',
        actions: [
          { click: { role: ['button', 'Review with AI'] } },
          { waitVisible: { text: 'AI Suggestions' } },
          { click: { role: ['button', 'Edit and create rule'] } },
          { waitVisible: { text: 'Rule pattern' } },
        ],
      },
      {
        // 2. Preview with an invalid pattern → red note, Save disabled.
        name: '02-invalid-pattern',
        actions: [
          { click: { role: ['button', 'Review with AI'] } },
          { waitVisible: { text: 'AI Suggestions' } },
          { click: { role: ['button', 'Edit and create rule'] } },
          { waitVisible: { text: 'Rule pattern' } },
          { fill: { placeholder: 'e.g. COLES' }, text: 'ZZZUNMATCHED' },
          { waitVisible: { text: 'Pattern must appear' } },
        ],
      },
      {
        // 3. Green tick → one-click save + cascade group card, collapsed
        //    (shows the rule name AND pattern).
        name: '03-group-collapsed',
        actions: [
          { click: { role: ['button', 'Review with AI'] } },
          { waitVisible: { text: 'AI Suggestions' } },
          { click: { role: ['button', 'Accept — save rule & apply'] } },
          { waitVisible: { text: 'more transactions match' } },
        ],
      },
      {
        // 4. Group card expanded — matched transactions listed.
        name: '04-group-expanded',
        actions: [
          { click: { role: ['button', 'Review with AI'] } },
          { waitVisible: { text: 'AI Suggestions' } },
          { click: { role: ['button', 'Accept — save rule & apply'] } },
          { waitVisible: { text: 'more transactions match' } },
          { click: { text: 'more transactions match' } },
          { waitVisible: { text: 'BUDERIM' } },
        ],
      },
      {
        // 5. Queue state after Confirm all.
        name: '05-after-confirm-all',
        actions: [
          { click: { role: ['button', 'Review with AI'] } },
          { waitVisible: { text: 'AI Suggestions' } },
          { click: { role: ['button', 'Accept — save rule & apply'] } },
          { waitVisible: { text: 'more transactions match' } },
          { click: { role: ['button', 'Confirm all'] } },
          { waitHidden: { text: 'more transactions match' } },
        ],
      },
    ],
  },
  {
    name: 'bt-budget-savings-pots',
    app: budgetTrackerApp,
    description:
      'Budget Tracker → Budget: M21 savings-goal setter (Set amount / Use my savings ' +
      'budget) + savings-role category pot treatment. The whole flow is driven through ' +
      'the UI (assign Savings role → expand → Add/Edit pot), so no seed data is needed. ' +
      'Pot modals carry a Monthly contribution field (the ordinary per-subcategory budget) ' +
      'above target/deadline/opening, so the derived goal is reachable to non-zero in-UI.',
    viewport: { width: 1280, height: 1400 },
    nav: [
      { click: { role: ['button', 'Budget'] } },
      { waitVisible: { text: 'Savings Goal' } },
    ],
    // Reusable action fragment: assign Savings role to the first category, expand
    // it, open Add pot, and create "House deposit" with a $750/mo contribution +
    // $50,000 target + $12,000 opening. ("None" placeholder is shared by the
    // contribution [first] and opening [second] inputs → opening uses nth:1.)
    states: [
      {
        // 1. Setter, amount mode (default) with a value typed — and, since no
        //    Savings-role holder exists yet, the derived toggle is DISABLED.
        name: '01-setter-amount-disabled-derived',
        actions: [
          { fill: { placeholder: '1000' }, text: '2150' },
          { waitVisible: { text: 'A fixed monthly target you set by hand' } },
        ],
      },
      {
        // 2. Assign Savings role → add a pot with a $750/mo contribution → switch
        //    to derived → the read-only figure is now a REAL non-zero amount.
        name: '02-setter-derived',
        actions: [
          { select: { selector: 'select[title="Semantic role (income / savings)"]' }, value: 'savings' },
          { click: { text: '$0/mo' } },
          { click: { role: ['button', 'Add pot'] } },
          { waitVisible: { text: 'A new subcategory under' } },
          { fill: { placeholder: 'e.g. Emergency fund' }, text: 'House deposit' },
          { fill: { placeholder: 'None' }, text: '750' },
          { fill: { placeholder: 'No target' }, text: '50000' },
          { click: { role: ['button', 'Create pot'] } },
          { waitHidden: { text: 'A new subcategory under' } },
          { click: { role: ['button', 'Use my savings budget'] } },
          { waitVisible: { text: 'from your Savings category' } },
        ],
      },
      {
        // 3. Pot rows — a pot with a contribution shows "$750/mo · Target $50,000".
        name: '03-pot-rows',
        actions: [
          { select: { selector: 'select[title="Semantic role (income / savings)"]' }, value: 'savings' },
          { click: { text: '$0/mo' } },
          { click: { role: ['button', 'Add pot'] } },
          { waitVisible: { text: 'A new subcategory under' } },
          { fill: { placeholder: 'e.g. Emergency fund' }, text: 'House deposit' },
          { fill: { placeholder: 'None' }, text: '750' },
          { fill: { placeholder: 'No target' }, text: '50000' },
          { click: { role: ['button', 'Create pot'] } },
          { waitHidden: { text: 'A new subcategory under' } },
          { waitVisible: { text: 'Target $50,000' } },
        ],
      },
      {
        // 4. Add pot modal — empty (now four fields: contribution + the three).
        name: '04-add-pot-empty',
        actions: [
          { select: { selector: 'select[title="Semantic role (income / savings)"]' }, value: 'savings' },
          { click: { text: '$0/mo' } },
          { click: { role: ['button', 'Add pot'] } },
          { waitVisible: { text: 'A new subcategory under' } },
        ],
      },
      {
        // 5. Add pot modal — filled (name + contribution + target + opening).
        name: '05-add-pot-filled',
        actions: [
          { select: { selector: 'select[title="Semantic role (income / savings)"]' }, value: 'savings' },
          { click: { text: '$0/mo' } },
          { click: { role: ['button', 'Add pot'] } },
          { waitVisible: { text: 'A new subcategory under' } },
          { fill: { placeholder: 'e.g. Emergency fund' }, text: 'House deposit' },
          { fill: { placeholder: 'None' }, text: '750' },
          { fill: { placeholder: 'No target' }, text: '50000' },
          { fill: { selector: 'input[placeholder="None"]', nth: 1 }, text: '12000' },
        ],
      },
      {
        // 6. Edit pot modal — populated. Create a pot with all fields, then reopen it.
        name: '06-edit-pot-populated',
        actions: [
          { select: { selector: 'select[title="Semantic role (income / savings)"]' }, value: 'savings' },
          { click: { text: '$0/mo' } },
          { click: { role: ['button', 'Add pot'] } },
          { waitVisible: { text: 'A new subcategory under' } },
          { fill: { placeholder: 'e.g. Emergency fund' }, text: 'House deposit' },
          { fill: { placeholder: 'None' }, text: '750' },
          { fill: { placeholder: 'No target' }, text: '50000' },
          { fill: { selector: 'input[placeholder="None"]', nth: 1 }, text: '12000' },
          { click: { role: ['button', 'Create pot'] } },
          { waitHidden: { text: 'A new subcategory under' } },
          // The created pot is the 3rd pot row → its Edit pot button (nth 2).
          { click: { selector: 'button', hasText: 'Edit pot', nth: 2 } },
          { waitVisible: { text: 'each field is optional' } },
        ],
      },
      {
        // 7. Edit pot modal — a field cleared (Monthly contribution Clear pressed).
        name: '07-edit-pot-cleared',
        actions: [
          { select: { selector: 'select[title="Semantic role (income / savings)"]' }, value: 'savings' },
          { click: { text: '$0/mo' } },
          { click: { role: ['button', 'Add pot'] } },
          { waitVisible: { text: 'A new subcategory under' } },
          { fill: { placeholder: 'e.g. Emergency fund' }, text: 'House deposit' },
          { fill: { placeholder: 'None' }, text: '750' },
          { fill: { placeholder: 'No target' }, text: '50000' },
          { fill: { selector: 'input[placeholder="None"]', nth: 1 }, text: '12000' },
          { click: { role: ['button', 'Create pot'] } },
          { waitHidden: { text: 'A new subcategory under' } },
          { click: { selector: 'button', hasText: 'Edit pot', nth: 2 } },
          { waitVisible: { text: 'each field is optional' } },
          // Clear the Monthly contribution (first Clear) → returns to "None".
          { click: { role: ['button', 'Clear'] } },
        ],
      },
    ],
  },
  {
    name: 'bt-savings-tab',
    app: budgetTrackerApp,
    description:
      'Budget Tracker → Savings tab (PR 2): nav item, header strip (derived goal / ' +
      'saved this month / total across pots), pot-balances trajectory chart, and pot ' +
      'cards for three archetypes (sinking fund / target-only / target+deadline behind ' +
      'pace). Add movement modal writes a manual signed transaction. Empty state when no ' +
      'savings role exists. Home tile shows the derived ring and retargets here. Mock ' +
      'seed provides a Savings category + 3 pots + movements.',
    viewport: { width: 1280, height: 1500 },
    nav: [
      { waitVisible: { role: ['button', 'Savings'] } },
    ],
    states: [
      {
        // 1. Populated tab — header strip + trajectory chart + 3 pot cards
        //    (Holidays sinking fund, New car on-track, House deposit behind pace).
        //    The sidebar shows the new Savings nav item (Budget ▸ Savings ▸ Cashflow).
        name: '01-tab-populated',
        actions: [
          { click: { role: ['button', 'Savings'] } },
          { waitVisible: { text: 'Pot balances over time' } },
          { waitVisible: { text: 'Behind pace' } },
        ],
      },
      {
        // 2. Empty state — remove the Savings role on the Budget tab, then view Savings.
        name: '02-empty',
        actions: [
          { click: { role: ['button', 'Budget'] } },
          { waitVisible: { text: 'Savings Goal' } },
          // 5 regular categories → the Savings category's role select is nth 4.
          { select: { selector: 'select[title="Semantic role (income / savings)"]', nth: 4 }, value: '' },
          { click: { role: ['button', 'Savings'] } },
          { waitVisible: { text: 'No savings category configured yet' } },
        ],
      },
      {
        // 3. Add movement modal — default (Contribution / in).
        name: '03-movement-in',
        actions: [
          { click: { role: ['button', 'Savings'] } },
          { waitVisible: { text: 'Pot balances over time' } },
          { click: { role: ['button', 'Add movement'] } },
          { waitVisible: { text: 'Saved as a manual transaction' } },
          { fill: { placeholder: '0.00' }, text: '500' },
        ],
      },
      {
        // 4. Add movement modal — Withdrawal (out): red live-balance preview.
        name: '04-movement-out',
        actions: [
          { click: { role: ['button', 'Savings'] } },
          { waitVisible: { text: 'Pot balances over time' } },
          { click: { role: ['button', 'Add movement'] } },
          { waitVisible: { text: 'Saved as a manual transaction' } },
          { fill: { placeholder: '0.00' }, text: '500' },
          { click: { role: ['button', 'Withdrawal (out)'] } },
        ],
      },
      {
        // 5. Home tile — derived-mode ring gauge (retargets to Savings on click).
        name: '05-home-tile',
        actions: [
          { click: { role: ['button', 'Home'] } },
          { waitVisible: { text: 'Savings Goal' } },
        ],
      },
    ],
  },
]
