# @transformotion/contracts

This package is the canonical contract source for Transformotion runtime work.

## Ownership

- TypeScript shapes and executable contract constants live in `src/`.
- Behavioural and narrative contract notes live in `spec/`.
- Contract changes are made directly in this package.
- Shape or semantic changes must update the relevant contract version metadata
  in the same PR.

`v0-reference/` is archived historical evidence only. Do not add new imports or
build steps that depend on it.

## Validation

Run:

```bash
pnpm check:contracts
```

The validator checks that this package remains self-contained and then
typechecks the package.
