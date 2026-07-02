# Budget Tracker Behaviour Contract

## Runtime Boundary

Budget Tracker owns its REST API, WSS API, transactions/rules/settings/budget
data tables, AI cache/jobs runtime, AI proxy behavior, and deploy lifecycle.
Platform does not own Budget Tracker runtime behavior.

## REST Behaviour

Routes are represented in `api.ts`. Protected routes require Budget Tracker app
entitlement and account membership before app table access.

Settings include AI review controls represented by `BudgetSettings`. Runtime
code batches review work and emits `BudgetTrackerWsBatchResultMessage` with
pass progress and result counts.

## Mock Behaviour

`MockAIService.reviewTransactions()` must produce `ReviewBatchResult`
compatible findings and must not bypass the public service contract used by
live review flows.
