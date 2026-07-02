# Budget Tracker Navigation Contract

Budget Tracker frontend state is represented by `BudgetTrackerFrontendState` in
`types.ts`.

The UI owns budgeting, transaction review, settings, AI review, CSV import, and
export flows. It consumes Launchpad-issued auth/session state and must fail
closed when `budget-tracker` entitlement or account membership is missing.

Mock navigation and store state must compile against the typed mocks in
`mocks.ts`.
