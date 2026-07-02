## Summary

Refs #

## Change classification

Choose one:

- [ ] Contract-changing
- [ ] Non-contract UI polish
- [ ] Runtime-only
- [ ] Emergency hotfix

Contract-changing work must update `packages/contracts/` before or alongside
runtime implementation. Non-contract UI polish means styling, layout, copy, icons,
responsive behaviour, accessibility attributes, modal/scrollbar polish, or
component arrangement only, with no data/API/WSS/cache/mock/settings/runtime
semantic change.

## Contract and UI evidence

- [ ] Contract files changed:
- [ ] `pnpm check:contracts`
- [ ] Existing UI visual evidence attached:
- [ ] Net-new v0 reference used:

If net-new v0 reference was used, cite the v0 commit and include a visual diff
or disposition list. Existing runtime UI surfaces are repo-owned and reviewed
directly.

## Emergency Contract Reconciliation

Complete only for approved delayed-contract hotfixes:

- Why delayed contract update was necessary:
- Explicit owner approval reference:
- Affected contract files/surfaces:
- Affected UI/mock surfaces:
- Contract reconciliation PR or issue link:
- Expected reconciliation deadline:
- Validation plan:

## Validation

- [ ] `pnpm check:contracts`
- [ ] Other:
