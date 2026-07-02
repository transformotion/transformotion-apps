# Stock Analyser — Structured Output (behaviour)

Canonical behaviour for how Stock Analyser AI surfaces produce structured
results. Schemas are defined in `contracts/stock-analyser/structured-output.ts`
(direct JSON Schema + aligned TypeScript types, dependency-free). This document
describes behaviour only; the TypeScript contract is the authority.

## Why structured output

AI surfaces were historically **prompt-and-parse**: the provider was asked for
JSON inside prose, then the runtime did `JSON.parse(stripCodeFences(text))`.
Stricter/looser model variants produce malformed JSON, which is the root cause
of parse failures. The canonical schemas let the runtime request **real
provider structured output** (`responseSchema`) instead of parsing prose. The
runtime must not invent these schemas locally — it consumes this package's
canonical contract.

## Surfaces covered

| Surface | Canonical schema | Type |
|---|---|---|
| Market Analysis | `marketAnalysisResultJsonSchema` | `MarketAnalysisProviderResult` (enriched: `MarketAnalysisResult`) |
| Per-ticker analysis | `stockAnalysisResultJsonSchema` | `StockAnalysisResult` |
| Recommendations | `recommendationsResultJsonSchema` | `RecommendationModelOutput` (enriched: `Recommendation`) |

Recommendations structured output is now **defined** (#592). It models the
**model output only** — the ranked shortlist with the `recommendationSignal`
(pick/watch/avoid) vocabulary. As with Market, the schema is the **provider
payload**: the `runRecommendations` engine overlays the real `price`/`change`
(OHLCV, #468) **after** parsing to produce the rendered `Recommendation`, so the
schema omits those enrichment fields. See `recommendations.behaviour.md` for the
two-stage flow and the prose-grounding constraint.

### Provider payload vs. enriched result (Market)

The Market schema models the **provider payload only**. The app adds
`recommendationUniverse` and `sourceRegion` to each sector **after** parsing
(resolved from `bestExchange` within the analysed region). Those enrichment
fields are intentionally absent from the schema; `MarketAnalysisProviderResult`
is what crosses the provider boundary, `MarketAnalysisResult` is the enriched
in-app value.

## Mode behaviour

- **Fast mode**: use **single-pass structured output** where the provider
  supports it. No web search; the model formats directly to the schema.
- **Live mode (web search)** may be **provider-specific**:
  - **Claude**: treat as **two-pass** — a search/research pass first, then a
    strict structured-formatting pass that emits the schema. Web search and
    strict structured output should not be assumed to combine in one pass.
  - **OpenAI / xAI**: a single-pass web search + structured output is allowed
    **only after the runtime verifies the provider supports that combination**.
    Until verified, fall back to a formatting pass.

## Fallback (tolerant parse) — secondary only

If structured output **fails or is unavailable** for a given provider/model, the
runtime MAY fall back to tolerant parse/retry (`JSON.parse` of fenced/loose
JSON, with a re-ask on failure). This fallback:

- is a **logged** fallback, never the primary mechanism;
- must be visibly attributable in runtime logs (so structured-output regressions
  are observable rather than silently masked);
- does not change the canonical schema — the schema remains the contract the
  payload is validated against.

## Provider-safety guarantees (from the contract)

Every canonical schema is Draft 2020-12 with: explicit `required`,
`additionalProperties: false`, explicit `enum`s, and **no** provider-specific
extensions. Provider-specific shaping (e.g. OpenAI strict-mode adjustments) is
applied by the runtime on top of the canonical schema, never baked into it.

## Versioning

`stockAnalyserStructuredOutputVersion` versions all schemas together. MAJOR =
breaking (removed/renamed required field, narrowed enum, changed type); MINOR =
backwards-compatible (new optional field, widened enum); PATCH =
annotation-only. On a MAJOR change, the runtime updates its `responseSchema`
wiring in the same change set after `pnpm check:contracts`.

## Out of scope

Runtime provider `responseSchema` implementation, M19 scheduler/background
jobs/notifications, and cache-freshness/admin settings are all out of scope for
the contract change that introduced these schemas.
