# Budget Tracker M15 Migration Review

> M15 #135 correction note: this is a raw sufficiency review of existing v0
> Budget Tracker contract material. It is not final #136/#137/#139 structure.

## Existing v0 Contract Material

The v0 repo already contains these Budget Tracker files:

- `ai-prompts.md`
- `api-endpoints.md`
- `aws-infrastructure.md`
- `changelog.md`
- `data-models.md`
- `gap-analysis.md`
- `README.md`
- `state-management.md`
- `ui-patterns.md`

These files are materially richer than the initial Launchpad/Platform/Stock
Analyser migration inputs and are sufficient as raw #135 input, with caveats
below.

## Runtime Sources Checked

- `packages/budget-domain/src/contracts.ts`
- `apps/budget-tracker/infrastructure/budget-tracker-api-stack.ts`
- `apps/budget-tracker/infrastructure/budget-tracker-tables-stack.ts`
- `apps/budget-tracker/infrastructure/bt-ws-stack.ts`
- `apps/budget-tracker/functions/*/src/index.ts`
- `apps/budget-tracker/lib/services/ai/*`
- `apps/budget-tracker/lib/repositories/budget-tracker/*`
- `apps/budget-tracker/stores/budget-tracker/*`

## Current Runtime Surfaces To Preserve Through #136/#137/#139

Budget Tracker current surfaces include:

- transactions API and table.
- budget-data API and table.
- matching rules API and table.
- settings API and table.
- business export API.
- AI CSV analysis and AI review APIs.
- app-owned AI jobs table.
- app-owned WSS authorizer/connect/default/disconnect runtime.
- WebSocket `connected`, `batch_result`, `complete`, and `error` message
  concepts.
- frontend stores for budget state and review state.
- AI review settings:
  - `aiReviewBatchSize`
  - `aiReviewParallelLimit`
  - `aiReviewConfidenceThreshold`

## Known Gaps / Cleanup For Later M15 Issues

#136 should decide what to do with non-contract planning/audit files:

- `gap-analysis.md` is not desirable as final canonical contract content.
- `changelog.md` may belong outside canonical contract scope or under an
  explicit archive/history convention.

#137 should convert shape authority to executable TypeScript-first contract
files rather than relying on markdown and `packages/budget-domain/src/contracts.ts`.

#139 should extract backend behaviour/IAM/DynamoDB/Lambda/WSS/AI provider
details without duplicating shared shapes.

#138 should remove runtime contract authority from
`packages/budget-domain/src/contracts.ts` by importing or re-exporting synced v0
contract types when executable contracts exist.

## Stale Risk

Budget Tracker contract content predates some M9 runtime separation and must be
checked for any text implying Platform owns Budget Tracker REST, WSS, AI
runtime, cache, or app tables. Those implications should be marked legacy or
removed during #136/#139.
