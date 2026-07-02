# Stock Analyser — ETFs (behaviour)

Canonical behaviour for the ETFs surface (#626). The TypeScript contract
(`contracts/stock-analyser/etfs.ts`) and the structured schema
(`etfsResultJsonSchema` in `structured-output.ts`) are the authority; this
document describes behaviour and prompt intent only. #626 mirrors #592 (Recs):
this is the v0/contract half; the runtime builds `runEtfs` after merge + sync.

## What changed and why

ETFs was historically a client-side, free-text, schema-less AI call living in
`etfs-tab.tsx` (the app-local `ETF` interface). Like the old Recommendations
surface, it had the **pricing-before-signal** shape: the model authored a
`signal` and a `price` in the same payload, so the signal was formed against a
**hallucinated** price rather than real market data.

#626 re-architects ETFs as a backend engine (`runEtfs`). The engine is the
**runtime's** build, against this contract — not built here.

## Two-stage flow (engine intent)

1. **Fetch the real price** — pull authoritative OHLCV market data (#468) for the
   candidate ETF set.
2. **Supply it, then rank** — give the model the **real** price as input, and the
   model ranks / forms its `recommendationSignal` **with** it.

The model output never authors `price`/`change`; the engine overlays the real
OHLCV price for display. So the displayed price and the price the signal was
formed on are the **same real number** — the structural fix for the bug.

## Vocabulary — reuse `recommendationSignal`: pick | watch | avoid

ETFs are a **shortlist**, exactly like Recommendations, so they **reuse** the
Recommendations vocabulary verbatim (enum, labels, and `RecommendationSignalBadge`
family). No fourth vocabulary is introduced.

| Surface | Field | Values | Judgment |
|---|---|---|---|
| Market Analysis | `sectorAction` | enter / maintain / exit | sector allocation |
| Recommendations | `recommendationSignal` | pick / watch / avoid | shortlist candidacy |
| **ETFs** | **`recommendationSignal`** | **pick / watch / avoid** | **shortlist candidacy** |
| Single Analyser | `technicalVerdict` | BUY / HOLD / SELL / NEUTRAL | single-stock technical |

Badge semantics (consistent with the other families): **Pick** → positive,
**Watch** → neutral, **Avoid** → caution.

## Prose grounding constraint (prompt intent)

Constraint to author into the engine's prompt:

- **Reason on grounded facts**: the supplied real price, fees (expense ratio),
  category, yield, asset size.
- **Do NOT assert precise unverified technicals**: no specific moving-average
  positions, no exact RSI values, unless grounded.
- Qualitative reasoning is fine; invented technical specifics are not.

## Response shape

Each ETF carries: `ticker`, `name`, `category`, `expenseRatio`,
`recommendationSignal`, `analysis`, plus the engine-overlaid real `price` /
`change`.

- **Dropped** vs. the old client-side `ETF`: the model-authored `price`/`change`
  (now the real OHLCV overlay) and the old design-system `signal` (replaced by
  `recommendationSignal`).
- **`expenseRatio`** stays a **model-authored** fund attribute — it is a stable
  fund fact the shortlist reasons on, alongside category/yield. If a future data
  source provides authoritative fund metadata, `expenseRatio` can move to the
  overlay the same way `price` did; that is out of scope for #626.
- **`category`** excludes the old tab-local `"All"` value, which was a FILTER
  concept, never a real per-ETF category.

## No mode dimension

Unlike Recommendations (scope `universe | mode | sector`), ETFs are purely
**market-keyed**: `EtfMarket` = `ASX | US | Global`. There is no
Top-Picks/Bottom-of-Cycle mode and no sector filter, so the cache scope key is
simply the market.

## Thin-UI surface

The ETFs tab is a **thin caller**: it calls the engine read-first-from-cache,
fetch-on-miss (the #590 cache-first pattern via `useScopedAnalysis`), receives
finished ETFs, and renders the Pick/Watch/Avoid badge + real price/change +
prose. It does **not** generate the signal and does not author the price.

> v0 prototype note: until the runtime `runEtfs` engine exists, the v0 tab
> continues to drive `useScopedAnalysis` mock-backed (no live APIs in v0). The
> tab's request/result are aligned to this contract so the prototype is faithful
> for owner review; the runtime replaces the mock path with the real two-stage
> engine against the same contract.

## Out of scope

Building the `runEtfs` engine (runtime), ETF batch warming (#594), and the ETF
service-principal prefix fix (runtime). Contract + surface only.
