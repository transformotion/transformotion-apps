# Runtime Contract and Existing-UI Ownership

**Status:** Accepted

**Date:** 2026-07-03

## Context

M15 made the v0 repository (`transformotion-apps-b8`) canonical for contracts
and used `v0-reference/contracts/` as a generated sync target in this runtime
repo. That solved the earlier cross-tool coordination problem, but the live
apps have now moved beyond that workflow: runtime contracts are consumed,
validated, deployed, and debugged here; existing UI surfaces are reviewed
against the shipped runtime app; and v0 is no longer the safest place to own
live contract truth.

The Metals tab runtime port is the concrete precedent. The runtime PR cited v0
commit `fa302e0` and shipped a working surface, but a later visual diff found
small hand-port drift: the idle empty state was missing and the Perth Mint CTA
treatment differed. That confirms the future process: if v0 is used for a new
visual design, the port must include a cited v0 commit and a visual diff, while
the runtime repo remains canonical for the actual shipped surface.

## Decision

Contract authority moves to `packages/contracts/` in this repository.

Existing runtime UI surfaces are also repo-owned. Changes to existing surfaces
are implemented in this repo and reviewed visually by the owner. v0 is retired
as a canonical source for existing UI.

v0 remains optional reference material for net-new visual design only. A task
may choose to prototype a new surface in v0, but that output is advisory until
ported into this repo. Runtime PRs that port v0 design output must cite the v0
commit and include visual evidence showing the port matches or explicitly
disposes of differences.

`v0-reference/` is retained as a frozen historical archive marker and must not
be required by CI, deploy workflows, package imports, or normal validation.

## Consequences

- `packages/contracts/src` contains the executable TypeScript contract source.
- `packages/contracts/spec` contains behavioural contract notes migrated from
  the final v0 sync.
- `pnpm check:contracts` validates the repo-owned contract package.
- `pnpm sync:v0` is deprecated and remains only as a manual archive helper.
- The old v0 freshness gate and v0 byte-identity sync check are not required CI
  checks.
- Contract-changing work edits `packages/contracts/` directly and runs
  contract validation in the same PR or in a preceding contract PR.
- Only one contract PR chain should be active at a time.

## Related Notes

The Stock Analyser Metals engine stores feed-derived `METALS_CLOSES#{date}` and
`METALS_BASELINE#{year}` bookkeeping rows directly in the app-owned
`stock-analyser.analysis-cache-{stage}` table. This is an app-internal runtime
detail for computing 30-day and YTD metals changes from a low-request-count
metals.dev feed. It does not change the user-facing `METALS` shared cache
contract and remains owned by Stock Analyser runtime code and data
architecture documentation.
