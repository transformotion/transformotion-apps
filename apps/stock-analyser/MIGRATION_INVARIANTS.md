# Stock Analyser Migration Invariants

These behaviours must be preserved when the monolithic
`stock-signal-analyser.html` (currently in the separate
`transformotion/stock-analyser` repo) is migrated into this Next.js
app during Phase 4 of the stabilisation plan.

Each item below has caused a production bug at least once. The
migrated version MUST include an automated test that fails if the
corresponding invariant is violated. Do not declare the migration
complete until every invariant below has a failing-then-passing test
in the monorepo's test suite.

## Historical incidents (root causes that must not recur)

1. BUY tags must render green, not amber. Root cause: exact-match
   comparison of `s.signal` failed for lowercase responses from
   Claude. Fix: signal normalisation via `rawSig.trim().toUpperCase()`
   plus `startsWith('BUY')`. Test: `normaliseSignal('buy')` and
   `normaliseSignal('STRONG BUY')` both map to class `buy`.

2. `computeLiveCycle` must work without a DOM container. Root cause:
   an early `if (!container) return` guard silently skipped portfolio
   cycle updates in batch mode. Fix: the function must compute and
   return results regardless of DOM presence. Test: call
   `computeLiveCycle(ticker, cacheKey)` with no container argument
   and assert a full result object is returned.

3. `isLive()` must always exist and return a boolean. Root cause: the
   function was accidentally deleted during an edit, causing all AI
   calls to silently degrade to Fast mode. Fix: function must exist
   and return `false` when the toggle element is absent. Test: call
   `isLive()` in a context without a toggle and assert `false`, not
   `undefined`.

4. Watchlist refresh must use `Promise.all`, not serial awaits. Root
   cause: serial `for` loop with `await` caused 30+ second refreshes.
   Test: performance test asserting concurrent fetches, or a
   code-level assertion that the relevant function calls `Promise.all`.

5. Claude tickers may not string-match portfolio tickers exactly
   (e.g. `BRN` vs `BRN.AX`). Root cause: exact string equality. Fix:
   match by array position first, then bare-code fuzzy match. Test:
   `matchTickers(['BRN'], ['BRN.AX'])` returns a positive match.

6. Claude may append prose after a JSON block. Root cause: naive
   `JSON.parse()`. Fix: depth-tracking parser that stops at the final
   closing brace. Test: `parseClaudeJson('{"a":1} Note: ...')`
   returns `{a:1}` without error.

7. AI prompts must include an explicit "no emoji, JSON only"
   instruction. Root cause: emoji in JSON responses caused parse
   failures. Test: snapshot test of the system prompt asserting the
   phrase "no emoji" appears.

## Additional invariants from the stock analyser testing brief

8. `normaliseTicker('VOO:US')` returns `'VOO'`.
9. `normaliseTicker('A200')` returns `'A200.AX'`.
10. `normaliseTicker('BRN:ASX')` returns `'BRN.AX'`.
11. `cmcCost(100)` returns `11` (brokerage floor).
12. `cmcCost(20000)` returns `15` (0.075% of $20,000).
13. Cache staleness thresholds match the documented table per context
    (`analyser`, `recommendations`, `metals`, `etfs`, `markets`).
14. Tab switching uses text match or panel ID, not `tabs[0]` index.
15. `confirm()` dialogs must not be used — use the double-tap
    confirmation pattern for UX consistency with the monolith origin.
16. Market Analysis and Analyser system prompts specify "no emoji,
    JSON only".

## Source references

These invariants were preserved from:
- `CLAUDE.md` in the monolithic `transformotion/stock-analyser` repo,
  section "Things That Have Bitten Us"
- Monolithic stock analyser `docs/cowork-testing-brief.md`, sections 4
  ("Key Invariants to Test") and 5 ("Things That Have Bitten Us
  Before")
