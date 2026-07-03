# Caching, warming & notifications — operating reference

Operating reference for the Stock Analyser cache, the daily cache-warming job, and
the notification engine. Sourced from shipped code (`apps/stock-analyser/functions/*`,
`apps/stock-analyser/lib/*`) and the #584 / #595 / #594 / #627 / #636 / #638 record.
TTLs and key prefixes are cited from the constants; where a number is a point-in-time
observation (e.g. the depth audit) it is dated.

All shared cache data lives in one DynamoDB table, `stock-analyser.analysis-cache-{stage}`,
under the reserved partition key `accountId = "SHARED"` (data that is identical for every
account — market/recs/etf/metals/analysis). Per-user async job records live in
`stock-analyser.job-results-{stage}` under the real `accountId`.

---

## 1. Two-layer cache model

There are two distinct layers. Confusing them is the usual source of "why is this a cache
miss" questions.

- **Layer A — list / summary caches** (`MARKET#`, `RECS#`, `ETF#`, `METALS`). These are the
  tab-facing AI-result surfaces, **warmed daily** by the notification engine and also written
  by a live tab run (write-on-miss). A cold tab open is a cache hit against the warmed entry.
- **Layer B — per-ticker `ANALYSIS#{ticker}`** (the Analyser page). This is **on-demand**: it
  is written by a live Analyser run, and **conditionally** warmed by the notification path for
  Portfolio/Watchlist tickers (§6). It is **not** warmed for the tickers inside the Layer-A
  lists — see the accepted depth boundary in §4.

Under both layers sit **raw-data caches** (`MARKET-DATA#`, `OHLCV#`) and the metals engine's
**feed-history bookkeeping** (`METALS_CLOSES#`, `METALS_BASELINE#`), which are written directly
by their owning Lambda (not through the shared-cache service-principal chokepoint).

### Write paths

| Path | Mechanism | Used by |
|---|---|---|
| **Service-principal** | invoke the `analysis-cache` Lambda `put-shared-cache` branch — the single write chokepoint; gated by `SHARED_PREFIXES` + `ALLOWED_SERVICE_PRINCIPALS` | the daily warm job (all Layer-A + `ANALYSIS#`) |
| **Authenticated PUT** | frontend `setCacheSnapshot` → `PUT /analysis-cache/{key}` with `shared:true`; `resolveWriteAccountId` forces the SHARED partition for a `SHARED_PREFIXES` key | a live tab run (write-on-miss) |
| **Direct** | the owning Lambda's own IAM grant (`PutItem` to `accountId=SHARED`), bypassing the chokepoint | raw-data + metals feed-history (see #637) |

`SHARED_PREFIXES = ['MARKET','ETF','RECS','METALS','ANALYSIS','CYCLE']`;
`ALLOWED_SERVICE_PRINCIPALS = ['stock-analyser-notification-engine','stock-analyser-recommendations','stock-analyser-metals','stock-analyser-etfs']`
(`apps/stock-analyser/functions/analysis-cache/src/index.ts`).

### Key registry

| Cache key | Writer(s) | Write path | TTL | Read by |
|---|---|---|---|---|
| `MARKET#{region}` | notification-engine (warm #584); live Market tab | service-principal / PUT | 24h | Market tab (`surface: market`) |
| `RECS#{universe\|mode\|sector}` | recommendations engine (warm #595); live Recs tab | service-principal / PUT | 24h | Recs tab (`surface: recs`) |
| `ETF#{market}` | etfs engine (warm #594); live ETFs tab | service-principal / PUT | 48h | ETFs tab (`surface: etfs`) |
| `METALS` | metals engine (warm #627 + async job); live Metals tab | service-principal / PUT | 24h | Metals tab (`surface: metals`) |
| `ANALYSIS#{ticker}` | notification-engine (conditional warm, §6); live Analyser / Portfolio / Watchlist | service-principal / PUT | 24h | Analyser tab (`surface: analyser`) + Portfolio/Watchlist enrichment |
| `METALS_CLOSES#{date}` | metals engine | **direct — sanctioned ([ADR](adr-service-principal-background-jobs.md), #637)** | 400d | metals engine only (internal feed history) |
| `METALS_BASELINE#{year}` | metals engine | **direct — sanctioned ([ADR](adr-service-principal-background-jobs.md), #637)** | 400d | metals engine only (YTD baseline) |
| `MARKET-DATA#{ticker}#{range}#{interval}` | market-data, cycle-data | **direct** | 8h | Live-mode price/OHLCV; engines' real-price stage |
| `OHLCV#{ticker}` | cycle-data | **direct** | 1h | `FullCycleGauge` live cycle position |
| `CYCLE#{geography}` | **none — reserved prefix, no current writer** | — | — | — |

Notes:
- The TTL numbers come from `STOCK_ANALYSER_CACHE_TTL_SECONDS` (`contracts/stock-analyser/cache-freshness`)
  for the tab surfaces (market/recs/analyser/metals/portfolio/watchlist = 24h, etfs = 48h) and
  from per-function constants for the rest: `METALS_CLOSES_TTL_SECONDS = 400d` (metals),
  `MARKET_TTL = 8h` / `CYCLE_TTL = 1h` (cycle-data), `TTL_SECS = 8h` (market-data).
- `CYCLE#{geography}` is listed in `SHARED_PREFIXES` (and older docs) but **no code writes it**;
  the computed cycle position is stored under `OHLCV#{ticker}`. Treat `CYCLE#` as a reserved
  legacy prefix, not a live surface.
- `MARKET-DATA#`/`OHLCV#` are direct-write raw-data caches — their prefixes are intentionally
  **not** in `SHARED_PREFIXES` (they never route through the service-principal branch).

---

## 2. The warm chain

The notification engine (`stock-analyser-notification-engine-{stage}`) runs **daily** on an
EventBridge schedule (no HTTP route). After the #571 kill-switch gate (§6) it warms, in order:

```
market (#584)  →  Recs (#595)  →  ETFs (#594)  →  Metals (#627)  →  notification transitions/sends
```

- **Order + gating.** All four warms run **after** the kill-switch gate — engine OFF ⇒ zero
  warming and zero sends (the switch pauses the whole batch, the larger AI-credit consumer).
- **Best-effort isolation.** Each warm step is wrapped independently; a failure is logged and
  never aborts the run or the sibling steps (`notification-{market,etfs,metals}-warm-error`).
- **Once per run.** Every warm runs once per job execution, not per account.

Per-surface behaviour:

| Surface | Fan-out | Filter |
|---|---|---|
| Market | one grounded market-analysis per region (`ANALYSIS_REGIONS`), synchronous inline | none — all regions |
| Recs (#595) | async-invoke the recommendations engine per warmed sector | **smart-filter**: top-3 `enter`-flagged sectors **per region**, ranked by `cyclePosition` ascending (`WARM_RECS_CAP = 3`, ≤12 recs/run); mode `top-picks` only; cache key uses the `'Top Picks'` display label |
| ETFs (#594) | async-invoke the etfs engine once **per market** (ASX/US/Global) | **none** — ETFs have no `enter`-gate equivalent, all 3 markets every run |
| Metals (#627) | **single** async-invoke of the metals engine | n/a — Metals is one global `METALS` key |

Market warm is synchronous (it computes the AI market analysis inline, then SHARED-writes).
Recs/ETFs/Metals are **fire-and-forget** `Event` invokes of their engines, which each run the
**same engine core a live tab run uses** and SHARED-write the result — so warmed data is
identical-to-live by construction.

---

## 3. External feed economics (metals.dev)

Only the Metals engine calls an external feed. Per `fetchMetalsDevFeed`
(`apps/stock-analyser/functions/metals/src/index.ts`) a single run makes:

| Call | When | Count |
|---|---|---|
| `latest` | every run | 1 |
| `timeseries` (30-day seed) | only if **no** `METALS_CLOSES#` rows exist (cold start) | 0 or 1 |
| `timeseries` (YTD baseline) | only if `METALS_BASELINE#{year}` is not cached | 0 or 1 |

So a run is **1–3 metals.dev requests**, and the seed is a **single batched 30-day `timeseries`
call** (it produced ~31 `METALS_CLOSES#` rows from one request — verified 2026-07-03), never
one-request-per-day.

- **Steady state** (closes seeded, baseline cached): **1 request/day** ≈ **30–31/month**.
- **+1/year** when the YTD baseline year rolls over.
- **Cold start**: +1 (the batched 30-day seed).
- Against the **100/month free tier**, the daily warm sits at ~31/month — comfortable headroom.
  Live Metals tab runs consume additionally (each is a full `computeMetals`); a manual Metals
  refresh = **1 metals.dev request** (latest; seed skipped, baseline cached — see §5).
- metals.dev exposes **no usage API endpoint** (`/v1/usage` → 404; no quota field in responses);
  usage is dashboard-only. Per-run consumption is measured by the **table-delta method**
  (baseline `cachedAt` frozen + `METALS_` row count unchanged ⇒ no re-seed; per the #635/#638
  verifications).

The `METALS_CLOSES#`/`METALS_BASELINE#` rows are the engine's **direct-write feed-history
bookkeeping** (400-day TTL), outside the service-principal path **by design** — see #637 for the
sanctioned boundary and the guard against the latent `SHARED_PREFIXES` gap.

---

## 4. Accepted depth boundary (decision record)

**Decision: the daily warm covers Layer-A list surfaces only. It does NOT warm the per-ticker
`ANALYSIS#{ticker}` page behind a list's click-through. This is by design, owner-accepted.**

The Recs, ETFs and Metals engines write **zero** `ANALYSIS#` entries (grep-verified). Clicking a
card into the Analyser (`navigateToAnalyser(ticker)`) therefore reads an unwarmed
`ANALYSIS#{ticker}` and triggers a **live model call**.

Point-in-time audit (dev, **2026-07-03**), warmed-list tickers with an `ANALYSIS#` entry present:

| Click-through | Warmed at Analyser layer |
|---|---|
| Recs picks → Analyser | **1 / 68** (incidental — the one hit is a Portfolio/Watchlist straggler) |
| ETF tickers → Analyser | **1 / 22** (incidental) |
| Metals Perth Mint → Analyser | **~0 / 4** (2 stragglers from manual testing) |

Closing this would mean fanning out a per-ticker analysis warm after each list warm — on the
order of **90+ two-pass web-search analyses/day** (68 recs picks + 22 ETFs + 4 metals), a
material recurring AI-credit cost. **The owner has accepted the current boundary** (cold
click-through in exchange for not paying that daily cost). The offered follow-up issue to (a)
warm `ANALYSIS#` for list tickers and (b) make Portfolio/Watchlist warming unconditional is
**declined — decided, not deferred**; this section is the record so it is not re-raised as a
defect. If the trade-off is revisited, the smart-filter/cap approach from #595 (warm only the
strongest N, not the whole list) is the natural shape.

Portfolio/Watchlist `ANALYSIS#` warming is **conditional** on the notification path (§6) and is
also accepted as-is.

### 4a. Live Analyser cost & why a research sub-cache was rejected (#610 / #612)

Measured baseline — **N=5 real Analyser Live two-pass runs, gpt-5.5, 2026-07-03** (faithful
harness replicating the `openai.ts` two-pass): a Live call averages **42,642 tokens**, split
**pass-1 grounded research 92.8% / pass-2 format 7.2%**, with **~5 web searches per call, all in
pass-1**. Search volume — not output size — is the dominant cost driver; pass-2 (formatting the
grounded evidence into the strict schema) makes **zero** web-search calls. ($ ≈ $0.14–0.24/call at
assumed gpt-5.5 rates — $1.25/1M in, $10/1M out, web_search ~$0.01–0.03/call.)

**Thin-coverage tickers never cache.** `security` grounding **hard-fails (502)** when pass-1
returns `DATA_STATUS: UNAVAILABLE` (the #601 guard) — e.g. AZN.L in the baseline — so a live call
on an ungroundable ticker errors rather than producing a cacheable result.

**Research sub-cache (#610) — considered, rejected.** Caching pass-1's grounded evidence
(`ANALYSIS-RESEARCH#{ticker}`) to skip the searches looks attractive given the 92.8% share (the
evidence is a self-contained string, trivially cacheable). But it is **redundant with the 24h
`ANALYSIS#` result cache**: a repeat view within 24h already hits the result cache at **zero**
cost, and a research entry could only help if the result cache missed *while* the research entry
was still valid — impossible, because grounded research goes stale in **hours**, so its TTL must be
**shorter** than the 24h result TTL and it therefore always expires first. Force-refresh must serve
fresh anyway, and no other surface consumes per-ticker research. Net expected saving ≈ $0 against
real added complexity (second cache layer, staleness guard, new SHARED prefix + allowlist,
evidence-age plumbing). Closed not-required. **Do not re-propose on rediscovering the 92.8%** — the
number is real; the redundancy is what kills it.

**#612 (trim pass-2 re-ingested evidence) — closed on the same baseline, same day.** Pass-2 input
is ~7.2% of tokens (~1,700 tok of re-sent evidence ≈ ~4% of the call); a perfect trim saves
~$0.002–0.004/call — immaterial, and #612's own scope condition ("apply only where pass-2 input
cost remains material after higher-value fixes") is unmet. Revival condition: a future surface that
re-introduces heavyweight two-pass with materially larger pass-1 → pass-2 re-ingestion — re-measure
first (#617 already moved Recs off structured-Live, shrinking the two-pass footprint).

---

## 5. UI behaviour (cache-first reads)

The five AI tabs share the cache-first `useScopedAnalysis` hook
(`apps/stock-analyser/lib/hooks/use-scoped-analysis.ts`):

- **Idle on load / scope change.** A tab renders nothing (idle `EmptyState`) until `run()`, even
  if a fresh entry exists. (The idle `EmptyState` styling is pending the Phase-2 tidy.)
- **`run()` (Run / Re-run).** Reads the scope's real SHARED cache first; a present, **non-expired**
  entry is served with **no model call**. Miss/expired → fetch per the Live/Fast toggle, write
  back (authenticated PUT), render.
- **`refresh()`.** The only force-fetch: always fetches per the toggle and rewrites the cache. A
  Metals refresh drives exactly **1 metals.dev request** (latest; the 30-day closes and the YTD
  baseline are already cached, so the seed and baseline calls are skipped).
- **Live vs Fast.** Only decides what a *fetch* does (`webSearch` true/false); it does not affect
  a cache hit.

What users see: **warmed data aged up to its TTL**. The freshness badge (fresh / recent / stale /
outdated) is derived from the default 25% / 75%-of-TTL policy (`deriveCacheFreshness`), so a
cache served late in its TTL window shows as "stale" while still being served without a model
call. Null/empty states: Metals `change30d` renders `"—"` when null (unseeded 30-day window);
idle tabs render the `EmptyState`.

---

## 6. Notifications

The same daily engine run, after warming, evaluates notification transitions. A ticker is
processed (and its `ANALYSIS#` warmed as a side-effect) only when an account passes all gates:

| Gate | Rule |
|---|---|
| **Eligibility** | ≥1 recipient who is an **active**, **consented**, **non-viewer** member (fail-closed on lookup error) |
| **Due** | interval elapsed since the account's `lastProcessedDate` (`accountIsDue`; default `intervalDays = 1`) |
| **Type** | the notification type (`portfolio` / `watchlist`) is enabled in the account config |

What a run **does**: warm the shared caches (§2); for each due+eligible account, resolve each
Portfolio/Watchlist ticker's analysis (`createAnalysisResolver` — reads the SHARED `ANALYSIS#`
cache, else generates and SHARED-writes it), evaluate BUY/SELL transitions, and email eligible
recipients on an actionable change. It also writes a send-log audit record.

What a run **does not** touch: tickers in accounts that are not due, have no eligible recipient,
or have the type disabled; and any `ANALYSIS#` for Recs/ETF/Metals list tickers (§4). The
`ANALYSIS#` warming is therefore a **conditional side-effect of notification processing**, not a
guaranteed warm of every Portfolio/Watchlist ticker.

**Kill-switch (#571).** App-wide flag on the settings table:
`pk = "SETTINGS"`, `sk = "NOTIFICATION_ENGINE_CONFIG#stock-analyser"`, attribute
`notificationsEnabled` (boolean). **Absent or malformed ⇒ ON** (`readEngineEnabled` defaults
true). When OFF, the run early-returns before any warm or send and writes an `engine-disabled`
audit note — so the schedule still fires but the batch no-ops. Re-enable = flip/remove the flag.

---

## 7. References

Architecture / ADR:
- `docs/adr-service-principal-background-jobs.md` — the service-principal write chokepoint,
  SHARED-only constraint, and the #637 direct-write feed-history designation.
- `docs/architecture/cdk.md` — warm-chain IAM grants + env wiring (`*_FUNCTION_NAME`,
  `ANALYSIS_CACHE_FUNCTION_NAME`, `grantInvoke`).
- `apps/stock-analyser/CLAUDE.md` (+ `AGENTS.md`) — Lambda registry and per-surface cache-key table.

Issues / PRs:
- **#571** notification-engine kill-switch · **#584** market-wide warm · **#592** Recs engine
  (two-stage price-before-signal) · **#594** ETF warm (PR **#636**) · **#595** Recs smart-warm ·
  **#626** ETF engine · **#627** Metals engine + warm (PR **#638**) · **#637** Metals
  direct-write boundary + latent `SHARED_PREFIXES` guard.
- Cost-lever decisions (§4a): **#610** research sub-cache (closed not-required — redundant with the
  #590 result cache) · **#612** pass-2 trim (closed not-required — immaterial) · **#617** moved Recs
  off structured-Live · **#601** grounding hard-fail guard.
