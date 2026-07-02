# Platform Contract Migration Input

> M15 migration note: migrated as current contract material and ownership input.
> Structure cleanup and executable conversion follow in #136/#137/#139.

## Source Material

This file captures the current post-M9 Platform contract inputs from the
runtime repo guidance and architecture docs. It is intentionally not the final
scope-first executable contract bundle. See `CURRENT_STATE_SURFACES.md` for the
#135 correction inventory of concrete substrate, URL, deploy, and shared runtime
profile surfaces.

Runtime source material inspected for #135:

- `AGENTS.md`
- `CONTRIBUTING.md`
- `MONOREPO.md`
- `docs/architecture/inventory.md`
- `docs/architecture/urls-and-deploy.md`
- GitHub issue #390 kickoff and sequencing notes

## Current Ownership Baseline

Platform owns neutral shared substrate only:

- CloudFront.
- DNS.
- ACM.
- shared storage/deploy foundations.
- shared build tooling.
- explicitly platform-wide contracts/config where justified.

Platform does not own auth-domain resources, app runtime resources, product
APIs, WebSocket paths, control-plane behaviour, or app-specific AI runtimes.

## Contract Inputs To Reconcile In Later Issues

#136/#139 should turn this migration input into explicit contract files for:

- shared substrate outputs consumed by app deploys.
- CloudFront, DNS, ACM, and storage/deploy foundation boundaries.
- shared package/construct contracts that are intentionally platform-wide.
- non-app runtime configuration that is genuinely shared substrate.

## Known Stale Risk

Any contract text implying Platform owns shared app REST, shared app WSS,
shared auth/control-plane APIs, shared AI runtime, app execution paths, or
app-specific data tables is pre-M9 migration debt and must not be made
canonical during #136/#139.
