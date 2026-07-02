# Interface Contracts — Budget Tracker

> M15 migration note: this folder is retained as current Budget Tracker contract
> material in the v0 repo. Structure cleanup and executable TypeScript contract
> conversion follow in #136/#137/#139.

**This folder is the single source of truth for how the Budget Tracker's UI and backend communicate.**

Both v0 (UI) and Claude Code (backend) must conform to these contracts. Neither tool may invent data shapes, endpoints, state patterns, AI prompts, or storage keys outside of what is documented here.

## Context

The Budget Tracker was designed and prototyped in a Claude chat as a working single-file React artifact. That prototype is **feature-complete and in daily use** — it is the authoritative behavioural reference for the app. These contracts are derived from that reference implementation.

v0 is rebuilding the UI as a polished production app. Claude Code is building the AWS backend. Both must conform to these contracts, so that when the two are wired together, they fit.

## Files in this folder

| File | Purpose |
|---|---|
| `README.md` | This file — overview and rules |
| `data-models.md` | TypeScript interfaces for every shared type |
| `api-endpoints.md` | Every backend endpoint — request/response/auth/errors |
| `ai-prompts.md` | Every Claude prompt verbatim, with schemas and models |
| `state-management.md` | Zustand stores, adaptor pattern, storage keys |
| `aws-infrastructure.md` | DynamoDB tables, Lambda functions, Cognito setup |
| `ui-patterns.md` | Component conventions, tabs, visual behaviour |
| `changelog.md` | Dated log of every contract change |

## How to use this folder

**Before making ANY change that touches:**

- A data shape crossing the UI/backend boundary → read `data-models.md`
- An API call (real or stubbed) → read `api-endpoints.md`
- State storage (Zustand, localStorage, cache) → read `state-management.md`
- A Claude/AI call → read `ai-prompts.md`
- AWS infrastructure → read `aws-infrastructure.md`
- Component structure, tabs, naming → read `ui-patterns.md`

**When a contract needs to change:**

1. **Update the relevant contract file FIRST**
2. **Add a dated entry to `changelog.md`** — what changed, why, what downstream work is required
3. **Only then** implement the code change
4. **Sync to the other repo** before the other tool is invoked next

## Ownership

| Domain | Owner |
|---|---|
| UI components, styling, visual behaviour, client-side interactions | **v0** |
| Data models, API contracts, AI prompts, state patterns, AWS infrastructure, adaptor implementations | **Claude Code** |
| Anything in `/contracts` | **Shared** — contract change required first, regardless of which tool initiates |

## Golden rules

1. **Never invent.** If a contract doesn't describe what you need, stop and flag it. Do not guess.
2. **Contract first, code second.** If the contract is wrong or incomplete, fix the contract before any code.
3. **Changelog every change.** Any update to any contract file must have a dated changelog entry.
4. **Sync after every change.** The other repo must receive updated contracts before the other tool is invoked.
5. **v0 stubs, Claude Code implements.** v0 provides in-memory stub implementations of every adaptor interface. Claude Code provides the real AWS-backed implementations. Both must satisfy the same interface.

## The adaptor pattern (critical)

v0 builds UI components that consume **interfaces**, never direct API calls or storage primitives.

```
Component  →  Zustand store  →  Adaptor interface  →  (stub OR real implementation)
```

- **v0's job**: define the interface, write stub implementations that keep data in memory or localStorage so the UI works standalone.
- **Claude Code's job**: write real implementations of those same interfaces backed by Lambda, DynamoDB, and Cognito.
- **Neither side changes the interface without updating `/contracts` first.**

This is the pattern that made the Stock Analyser migration clean. Budget Tracker follows the same model.

## Repo layout

- `transformotion/transformotion-apps-b8` — v0 repo, **authoritative source for `/contracts`**
- `transformotion/transformotion-apps` — runtime repo, consumes a generated read-only sync at `v0-reference/contracts/`

When contracts change: update the v0 repo contract first → commit and push it → run the runtime repo v0 sync → then runtime work resumes against the synced contract.
