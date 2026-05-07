# Budget Tracker — Migration Artifacts

This directory holds historical exports from the v0 prototype and source files for one-shot
migrations into the canonical DynamoDB-backed budget-tracker tables.

## Structure

Each migration concern lives in its own data-type directory:

- `transactions/` — transaction migration (this PR's scope; #187)
- `matching-rules/` — custom matching rules migration (#200; future)
- `settings/` — application settings migration (#204; future)
- `archive/` — historical artefacts preserved for audit trail

Each data-type directory contains:
- `exports/export.json` — the canonical export for that data type, ready for migration
- (Future) `schemas/` — TypeScript schema files if needed for type-safe parsing

## Provenance

The original prototype export was generated from browser localStorage on 2026-04-18 by Steve.
It was a single multi-purpose JSON file with 13 top-level keys. That file is preserved at
`archive/prototype-export-2026-04-18.json` for audit and is split into single-purpose files:

- 732 transactions → `transactions/exports/export.json` (top-level JSON array)
- 73 custom rules → `matching-rules/exports/export.json` (top-level JSON array; key was `customRules` in prototype)
- 6 settings fields (per canonical `BudgetSettings` type) → `settings/exports/export.json` (JSON object):
  `budgetOverrides`, `budgetFreqs`, `customCategories`, `deletedSubs`, `projectBudgets`, `csvFormatMappings`
- Metadata (`exportedAt`, `sourceApp`, `sourceChat`, `summary`) → archive only
- Orphaned field (`businessExpenseFlags`) → archive only (not present in canonical `BudgetSettings` type)

Missing `BudgetSettings` fields not in the prototype export (will need defaults at migration time):
`projectTasks`, `customTopCategories`, `customProjectCategories`,
`deletedCategories`, `deletedProjectCategories`, `disabledProjectCategories`

## Migration mechanism (canonical pattern)

For each data-type:

1. Migration script uploads `<data-type>/exports/export.json` to the migration uploads bucket:
   `s3://transformotion-migration-uploads-{account}/budget-tracker/<data-type>/<timestamp>/export.json`
2. Script POSTs `{ s3Key }` to `POST /api/migrations/budget-tracker/<data-type>/import` with auth
3. Lambda reads file from S3. File is a top-level JSON array (transactions) or JSON object (settings).
   Lambda applies transformations (UUID generation, accountId injection, `_ignore: true` on transfers)
   and persists to DynamoDB.

The S3-mediated approach provides:
- Audit trail: S3 versioning enabled, 90-day expiration
- Replayability: re-run from a stable S3 key without re-uploading
- Pattern reuse across all three migrations (#187, #200, #204)

## Cross-references

- `/contracts/budget-tracker/api-endpoints.md` — canonical endpoint contract
- `/migration-utilities/budget-tracker/transactions/` — transactions Lambda code
- `/PLAN.md` M6 outcomes — milestone-level scope
- Issues #187 (transactions), #200 (rules), #204 (settings)
