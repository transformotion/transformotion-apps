## Summary

Refs #

## Change classification

Choose one:

- [ ] Contract-changing
- [ ] Non-contract UI polish
- [ ] Runtime-only / no v0 impact
- [ ] Emergency hotfix

Contract-changing work must be v0-first unless explicitly approved as an
emergency hotfix. Non-contract UI polish means styling, layout, copy, icons,
responsive behaviour, accessibility attributes, modal/scrollbar polish, or
component arrangement only, with no data/API/WSS/cache/mock/settings/runtime
semantic change.

## v0 freshness

Choose one:

- [ ] Linked v0 PR/commit:
- [ ] No v0 impact:

Reason when selecting "No v0 impact":

## Emergency v0 Reconciliation

Complete only for approved runtime-first contract-changing hotfixes:

- Why runtime-first was necessary:
- Explicit owner approval reference:
- Affected contract files/surfaces:
- Affected UI/mock surfaces:
- v0 reconciliation PR or issue link:
- Expected reconciliation deadline:
- Validation plan:

## Validation

- [ ] `pnpm sync:v0`
- [ ] `pnpm check:v0-contracts`
- [ ] Other:
