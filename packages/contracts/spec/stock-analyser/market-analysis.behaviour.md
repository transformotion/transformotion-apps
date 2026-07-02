# Market Analysis — behaviour (M19 #535)

> Behaviour-only companion to `market-analysis.ts`. The TypeScript contract is
> the authority for shapes; this file describes the source-attribution
> behaviour layered on top.

## What #535 changes

The Market Analysis tab is grounded in **attributable** data. The LLM still does
the synthesis, but each card must **name the authoritative source(s)** it based
its read on, and the user must **see** that source.

This is the v0/contract half of #535. The runtime half (Bucket-1 sector OHLCV
fetch via the existing `getOhlcvData` seam, a net-new sector→proxy-ticker map,
and a supplied-data prompt block) is sequenced as separate runtime tickets
**after** this change lands and syncs.

## Source attribution

- `MarketAnalysisCardSource = { name: string }` is carried at the **per-card
  grain** on `MacroIndicator` and `SectorSignal` only.
- `briefing` and `actionSummary` carry **no** source — they are
  synthesis/conclusions over everything, not individually-sourced figures.
- Kept as an object (not a bare string) so a later upgrade can add fields
  (e.g. `url`, `domain`) without a breaking change.

## Prompt directive (source control)

For every macro indicator and every sector card, the model must name the
authoritative source it relied on and populate `source.name`. The directive:

- **Prefers authoritative / primary sources** — exchanges, central banks,
  regulators, and established financial press.
- **Explicitly forbids** basing figures on social media, forums, or
  unattributed aggregators.

Bar for this change = **attribution-and-visible** (model names sources; user
sees them). A hard domain-allowlist **validation** is a deferred later upgrade
and is intentionally **not** part of this change.

## Relationship to cache freshness (no second timestamp)

Source attribution is distinct from recency:

- **Source** = "where this read came from" (an authoritative institution).
- **Freshness** = "how recently the analysis was refreshed" — owned by the
  cache-freshness model (`lastUpdated` / `cacheAge`), the single source of
  truth for refresh time (job-run or manual, same write).

#535 reuses the existing freshness/recency display and introduces **no** second
`data-as-of` / vintage timestamp. The UI presents source as a natural companion
to the freshness display, visually and semantically distinct from it.

> Forward note only (do NOT build now): if Bucket-2 macro grounding is ever
> promoted off backlog, a per-card data vintage may then diverge from refresh
> time; revisit at that point.

## Deferred / out of scope here

- Runtime Bucket-1 sector OHLCV wiring (`getOhlcvData`, sector→proxy-ticker map,
  supplied-data prompt block).
- Bucket-2 macro grounding (stays cited web search).
- Hard domain-allowlist validation of sources.
