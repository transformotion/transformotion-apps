# Stock Analyser — Recommendations (behaviour)

Canonical behaviour for the Recommendations surface (#592). The TypeScript
contract (`contracts/stock-analyser/recommendations.ts`) and the structured
schema (`recommendationsResultJsonSchema` in `structured-output.ts`) are the
authority; this document describes behaviour and prompt intent only.

## What changed and why

Recommendations was historically a client-side, free-text, schema-less AI call
living in `recommendations-tab.tsx` (the app-local `Stock` interface). It had a
confirmed **pricing-before-verdict bug**: the model formed each verdict against
a **hallucinated** price, and the real OHLCV price was overlaid only *after*, for
display. The verdict therefore never saw the real price.

#592 re-architects Recommendations as a backend engine (`runRecommendations`).
The engine is the **runtime's** build, against this contract — not built here.

## Two-stage flow (engine intent)

1. **Fetch the real price** — pull authoritative OHLCV market data (#468) for the
   candidate set.
2. **Supply it, then rank** — give the model the **real** price as input, and the
   model ranks/forms its `recommendationSignal` **with** it.

The model output never authors `price`/`change`; the engine overlays the real
OHLCV price for display. So the displayed price and the price the verdict was
formed on are the **same real number** — the structural fix for the bug.

## Vocabulary — `recommendationSignal`: pick | watch | avoid

This is the **third, deliberately distinct** verdict vocabulary in the Stock
Analyser:

| Surface | Field | Values | Judgment |
|---|---|---|---|
| Market Analysis | `sectorAction` | enter / maintain / exit | sector allocation |
| **Recommendations** | **`recommendationSignal`** | **pick / watch / avoid** | **shortlist candidacy** |
| Single Analyser | `technicalVerdict` | BUY / HOLD / SELL / NEUTRAL | single-stock technical |

A Recommendations signal is a **shortlisting** judgment ("is this a candidate?"),
NOT a single-stock technical verdict. Keeping the language separate lets BHP be a
Recommendations **Pick** while the single Analyser independently reads **HOLD**
without the two looking contradictory.

Badge semantics (consistent with the other verdict-badge families):

- **Pick** → positive (a shortlist candidate)
- **Watch** → neutral (on the radar, not yet a candidate)
- **Avoid** → caution (explicitly not a candidate now)

## Prose grounding constraint (prompt intent)

The displayed `analysis` prose previously made **ungrounded specific technical
claims** (e.g. "trading above its 50-day and 200-day moving averages with a
strong RSI profile") — AI-asserted, never computed, yet shown to the user.

Constraint to author into the engine's prompt:

- **Reason on grounded facts**: the supplied real price, fundamentals, sector
  fit, relative value.
- **Do NOT assert precise unverified technicals**: no specific moving-average
  positions, no exact RSI values, unless they have been grounded.
- Qualitative reasoning is fine; invented technical specifics are not.

Same principle as the staleness lesson: never present specific, checkable claims
the system has not grounded.

## Response shape

Each candidate carries: `ticker`, `company`, `sector`, `subcategory`,
`recommendationSignal`, `analysis`, plus the engine-overlaid real `price` /
`change`. **Dropped** (generated before but never rendered, costing output
tokens for nothing): `cyclePosition`, `cycleStage`, `conviction`. These are not
in the contract. If a future redesign chooses to **show** per-candidate
technicals, that is a new decision that re-introduces the grounding requirement —
out of scope here; do not pre-build for it.

## Thin-UI surface

The Recs tab is a **thin caller**: it calls the engine read-first-from-cache,
fetch-on-miss (the #590 cache-first pattern already shipped via
`useScopedAnalysis`), receives finished recommendations, and renders the
Pick/Watch/Avoid badge + real price/change + prose. It does **not** generate or
compute the signal, and does not author the price.

> v0 prototype note: until the runtime `runRecommendations` engine exists, the v0
> tab continues to drive `useScopedAnalysis` mock-backed (no live APIs in v0).
> The tab's request/result are aligned to this contract so the prototype is
> faithful for owner review; the runtime replaces the mock path with the real
> two-stage engine against the same contract.

## Mode

`RecommendationMode` is canonical (`top-picks` | `bottom-of-cycle`);
`RECOMMENDATION_MODE_LABELS` provides the display strings ("Top Picks" / "Bottom
of Cycle"). The request also carries the `universe` (an exchange/index, never a
geography) and the Fast/Live `searchMode`.

## Out of scope

Building the `runRecommendations` engine (runtime), Recs batch warming (#594,
deferred), and any per-candidate technicals display.
