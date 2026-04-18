# Changelog

**Every change to any file in `/contracts` must be logged here.**

## Format

```
## YYYY-MM-DD — <short title>

**File(s) changed:** list
**Changed by:** v0 | Claude Code | Steve
**Why:** 1-2 sentences describing the motivation

**Change summary:**
- Bullet list of what changed

**Downstream work required:**
- What v0 needs to update (if anything)
- What Claude Code needs to update (if anything)
- Any data migration considerations

**Sync status:**
- [ ] Updated in `transformotion-apps`
- [ ] Updated in `transformotion-apps-b8`
```

## Rules

1. **Every change to every file in `/contracts` requires a changelog entry.** No exceptions.
2. **Entries are append-only.** Never edit or delete past entries.
3. **Date format is ISO** (YYYY-MM-DD) to keep the list sortable.
4. **Check both sync boxes before the next session of the other tool.**

---

## 2026-04-18 — Initial contracts established

**File(s) changed:** all
**Changed by:** Steve (with Claude in chat)
**Why:** Establish interface contracts between v0 UI and Claude Code backend for the Budget Tracker app. Derived from the feature-complete prototype built in earlier Claude chats.

**Change summary:**
- Created `README.md`, `data-models.md`, `api-endpoints.md`, `ai-prompts.md`, `state-management.md`, `aws-infrastructure.md`, `ui-patterns.md`, `changelog.md`, `gap-analysis.md`
- Documented all data types, API endpoints, AI prompts, storage patterns, AWS resources, and UI conventions
- Established ownership model: v0 owns UI, Claude Code owns backend, both share `/contracts`
- Established adaptor pattern: v0 stubs interfaces, Claude Code implements them

**Downstream work required:**
- **v0:** Rearchitect UI to use adaptor interfaces. Stub all data persistence and AI calls per `state-management.md`. Never invent types, endpoints, or prompts outside of what's in `/contracts`. Read `gap-analysis.md` for specific current-state deviations.
- **Claude Code:** Implement the AWS backend per `api-endpoints.md` and `aws-infrastructure.md`. Implement real adaptors matching the stub interfaces. Read `gap-analysis.md` for what already exists.

**Sync status:**
- [x] Updated in `transformotion-apps` — committed on `claude-code/establish-contracts` branch, PR open against `develop`
- [ ] Updated in `transformotion-apps-b8`

---

## 2026-04-18 — Gap analysis added with code-level findings

**File(s) changed:** `gap-analysis.md`
**Changed by:** Claude Code
**Why:** Code analysis of the existing monorepo revealed 8 specific type-level mismatches between what was built during the stock-analyser migration and what the contracts now define. Documented so Steve can decide which side to change before backend implementation begins.

**Change summary:**
- Added M1–M8 code-level mismatch findings covering: `CustomRule` shape conflict, `BudgetSettings` extensions, `useBudgetStore` action surface differences, missing `useAiStore`, category tree subcategory divergence, and built-in rule override pattern
- Added 2 additional open questions for Steve (M1 and M8 resolution)

**Downstream work required:**
- **Steve:** Answer open questions M1 and M8 before Claude Code updates the contracts
- **v0:** Read gap-analysis.md M1–M8 before implementing data layer — do not invent solutions, flag these items
- **Claude Code:** Await Steve's decisions on M1 and M8 before updating `data-models.md`

**Sync status:**
- [x] Updated in `transformotion-apps`
- [ ] Updated in `transformotion-apps-b8`
