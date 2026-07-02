# Budget Tracker Backend Data Contract

## Tables

Budget Tracker owns transactions, budget-data, matching rules, settings, AI
cache/jobs, and WSS connection tables. Account-scoped records are keyed by
account id. WSS connection records use connection id and TTL.

## Data Behaviour

Transactions, categories, subcategories, rules, settings, and budget data use
the executable shapes in `types.ts`. Review jobs may cache intermediate or
final AI results, but results must remain account scoped.

Export behavior uses `ExportRequest` and `ExportResponse` from `api.ts`.
