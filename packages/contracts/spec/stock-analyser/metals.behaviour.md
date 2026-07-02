# Stock Analyser — Metals (behaviour)

Canonical behaviour for the Metals surface (#627). The TypeScript contract
(`contracts/stock-analyser/metals.ts`) and the structured schema
(`metalsResultJsonSchema` in `structured-output.ts`) are the authority; this
document describes behaviour and prompt intent only. #627 mirrors #592 (Recs)
and #626 (ETFs): this is the v0/contract half; the runtime builds `runMetals`
(and the metals.dev integration) after merge + sync.

## What changed and why

Metals was historically a client-side, free-text, schema-less AI call living in
`metals-tab.tsx` (the app-local `Metal` interface). Like the old Recommendations
and ETFs surfaces, it had the **pricing-before-signal** shape: the model
authored `price`, `ytdChange`, `todayChange`, the 52-week range **and** the
`signal`/`analysis` in one payload — so every number was **hallucinated** and
the signal was formed against invented data rather than real spot prices.

#627 re-architects Metals as a backend engine (`runMetals`). The engine — and
the metals.dev feed integration — are the **runtime's** build, against this
contract, not built here.

## Two-stage flow (engine intent)

1. **Fetch the real spot data** — pull authoritative spot + change from the metals
   feed (**metals.dev**: XAU / XAG / XPT / XPD USD + AUD spot, today/YTD change),
   and derive the trailing 30-day change from stored daily closes (`null` until 30
   days exist).
2. **Supply it, then judge** — give the model the **real** feed data as input;
   the model authors **only** the `signal` and `outlook`, grounded on it.

The model output never authors any price data; the engine overlays the real feed
numbers for display. So the displayed spot and the data the signal was formed on
are the **same real numbers** — the structural fix for the bug.

## Feed-supplied data vs. model output

| Field | Source |
|---|---|
| `spotPrice` (USD/oz) | **metals feed** (metals.dev) |
| `audSpotPrice` (AUD/oz) | **metals feed** (metals.dev) |
| `todayChange` % | **metals feed** |
| `ytdChange` % | **metals feed** |
| `change30d` % (nullable) | **runtime** — computed from stored daily closes; `null` until 30 days exist |
| `signal` (BULL / NEUTRAL / BEAR) | **model** — grounded on the feed data |
| `outlook` (prose) | **model** — grounded on the feed data |
| `name` / `symbol` / Perth Mint target | **static config** (`MetalIdentity`) |

`change30d` is deliberately a **stored-history** derivation, not a point-in-time
feed field: the metals feed returns a snapshot, so the trailing-30-day change can
only be computed once the runtime has accumulated 30 days of daily closes. Until
then it is `null`, which the tab renders as "—". This is the #627 amendment that
replaced the `week52High`/`week52Low` pair (removed) with `audSpotPrice` +
`change30d`.

## Signal — keep BULL / NEUTRAL / BEAR

Metals keep the existing `TrendSignal` vocabulary (`BULL | NEUTRAL | BEAR`),
rendered by the existing `TrendBadge`. No new vocabulary is introduced. The
signal is **model-authored but grounded** on the supplied spot/change/history —
not free-invented.

Badge semantics (unchanged): **BULL** → positive/green, **NEUTRAL** → amber,
**BEAR** → caution/red.

## Prose grounding constraint (prompt intent)

Constraint to author into the engine's prompt:

- **Reason on grounded facts**: the supplied real USD/AUD spot price, today/YTD
  change, and the 30-day change when available (it may be `null`).
- **Do NOT assert precise unverified figures** it has not been supplied (invented
  price targets stated as fact, specific unverified technicals).
- Qualitative reasoning and clearly-framed scenarios are fine; invented specifics
  are not.

## Fixed universe — no scope dimension

Unlike ETFs (market-keyed) or Recommendations (universe | mode | sector), Metals
is a **fixed four-metal universe** (Gold, Silver, Platinum, Palladium). There is
no discovery, market, or mode dimension, so the cache scope key is the single
constant `metals:default`.

## Perth Mint clickthrough (preserved)

Each metal's "Analyse" clickthrough opens its Perth Mint ETF, unchanged from the
existing tab. These targets live in the static `MetalIdentity` config:

| Metal | Perth Mint ETF |
|---|---|
| Gold | `PMGOLD.AX` |
| Silver | `ETPMAG.AX` |
| Platinum | `ETPMPT.AX` |
| Palladium | `ETPMPD.AX` |

## Cache TTL — 24h, warm-first

Metals cache TTL moves **2h → 24h** (`STOCK_ANALYSER_CACHE_TTL_SECONDS.metals`),
aligning the cache lifetime with the **daily warm job** cadence (#530 principle):
the warm job refreshes spot data once per day, so a 24h TTL keeps served data
fresh against that cadence rather than expiring every 2h.

- **Read-first cache / fetch-on-miss** (#590): a non-expired entry is served
  without a fetch; a missing/expired entry triggers a fetch.
- **Manual refresh is live**: the tab's Refresh control issues a `live`
  (`searchMode: 'live'`) request — a real feed fetch — regardless of cache state.

## Thin-UI surface

The Metals tab is a **thin caller**: it calls the engine read-first-from-cache,
fetch-on-miss (the #590 cache-first pattern via `useScopedAnalysis`), receives
finished metals, and renders the feed-supplied USD/AUD spot + today/YTD/30-day
change (30-day shown as "—" when `null`) + the `TrendBadge` signal + the outlook
prose. It does **not** author the signal and does **not** author any price data.

> v0 prototype note: until the runtime `runMetals` engine + metals.dev
> integration exist, the v0 tab continues to drive `useScopedAnalysis`
> mock-backed (no live APIs in v0). The tab's request/result are aligned to this
> contract so the prototype is faithful for owner review; the runtime replaces
> the mock path with the real two-stage engine against the same contract.

## Out of scope

Building the `runMetals` engine + metals.dev integration (runtime, post-merge),
Metals warming (#594), and the PMGOLD.AX currency-null fix (separate, in flight).
Contract + surface only.
