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
//   { selector: 'div.foo', hasText: 'y' }  page.locator(selector).filter({ hasText })
//
// Action verbs: { click }, { waitVisible }, { waitHidden }, { press: 'Enter' }, { wait: ms }.

export const app = {
  // Booted by capture.mjs unless --no-boot is passed. Run from the repo root.
  bootCommand: 'pnpm --filter @transformotion/stock-analyser dev',
  // Loaded from mock.env (keeps the app in mock mode; no real network, boots on a fresh clone).
  envFile: 'mock.env',
  baseURL: 'http://localhost:3000/stock-analyser/',
  port: 3000,
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
]
