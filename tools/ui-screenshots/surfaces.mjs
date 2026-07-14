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
      'Derived is disabled until a Savings-role holder exists; the derived figure is ' +
      "read-only. Pots are subcategories carrying optional target/deadline/opening.",
    viewport: { width: 1280, height: 1400 },
    nav: [
      { click: { role: ['button', 'Budget'] } },
      { waitVisible: { text: 'Savings Goal' } },
    ],
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
        // 2. Assign the Savings role to the first category → derived enabled →
        //    switch to derived → read-only computed figure + lock + copy.
        name: '02-setter-derived',
        actions: [
          { select: { selector: 'select[title="Semantic role (income / savings)"]' }, value: 'savings' },
          { click: { role: ['button', 'Use my savings budget'] } },
          { waitVisible: { text: 'from your Savings category' } },
        ],
      },
      {
        // 3. Savings category expanded → POTS treatment: pot rows + Add pot.
        name: '03-pot-rows',
        actions: [
          { select: { selector: 'select[title="Semantic role (income / savings)"]' }, value: 'savings' },
          { click: { text: '$0/mo' } },
          { waitVisible: { text: 'Pots' } },
          { waitVisible: { role: ['button', 'Add pot'] } },
        ],
      },
      {
        // 4. Add pot modal — empty.
        name: '04-add-pot-empty',
        actions: [
          { select: { selector: 'select[title="Semantic role (income / savings)"]' }, value: 'savings' },
          { click: { text: '$0/mo' } },
          { click: { role: ['button', 'Add pot'] } },
          { waitVisible: { text: 'A new subcategory under' } },
        ],
      },
      {
        // 5. Add pot modal — filled (name + all three optional fields).
        name: '05-add-pot-filled',
        actions: [
          { select: { selector: 'select[title="Semantic role (income / savings)"]' }, value: 'savings' },
          { click: { text: '$0/mo' } },
          { click: { role: ['button', 'Add pot'] } },
          { waitVisible: { text: 'A new subcategory under' } },
          { fill: { placeholder: 'e.g. Emergency fund' }, text: 'House deposit' },
          { fill: { placeholder: 'No target' }, text: '50000' },
          { fill: { placeholder: 'None' }, text: '12000' },
        ],
      },
      {
        // 6. Edit pot modal — populated. Create a pot with fields, then reopen it.
        name: '06-edit-pot-populated',
        actions: [
          { select: { selector: 'select[title="Semantic role (income / savings)"]' }, value: 'savings' },
          { click: { text: '$0/mo' } },
          { click: { role: ['button', 'Add pot'] } },
          { waitVisible: { text: 'A new subcategory under' } },
          { fill: { placeholder: 'e.g. Emergency fund' }, text: 'House deposit' },
          { fill: { placeholder: 'No target' }, text: '50000' },
          { fill: { placeholder: 'None' }, text: '12000' },
          { click: { role: ['button', 'Create pot'] } },
          { waitHidden: { text: 'A new subcategory under' } },
          // The created pot is the 3rd pot row → its Edit pot button (nth 2).
          { click: { selector: 'button', hasText: 'Edit pot', nth: 2 } },
          { waitVisible: { text: 'each field is optional' } },
        ],
      },
      {
        // 7. Edit pot modal — a field cleared (target Clear pressed).
        name: '07-edit-pot-cleared',
        actions: [
          { select: { selector: 'select[title="Semantic role (income / savings)"]' }, value: 'savings' },
          { click: { text: '$0/mo' } },
          { click: { role: ['button', 'Add pot'] } },
          { waitVisible: { text: 'A new subcategory under' } },
          { fill: { placeholder: 'e.g. Emergency fund' }, text: 'House deposit' },
          { fill: { placeholder: 'No target' }, text: '50000' },
          { fill: { placeholder: 'None' }, text: '12000' },
          { click: { role: ['button', 'Create pot'] } },
          { waitHidden: { text: 'A new subcategory under' } },
          { click: { selector: 'button', hasText: 'Edit pot', nth: 2 } },
          { waitVisible: { text: 'each field is optional' } },
          // Clear the Target amount (first Clear) → field returns to "No target".
          { click: { role: ['button', 'Clear'] } },
        ],
      },
    ],
  },
]
