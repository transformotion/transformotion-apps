/**
 * runEtfs engine (#626).
 *
 * Two-stage, async, structured — mirrors runRecommendations (#592/#617): the
 * structural fix for the *pricing-before-signal* shape (the old client-side
 * free-text ETF call authored a `signal` and a hallucinated `price` in one payload).
 *
 *   Pass 1 — propose candidate ETFs for the market (searchMode-driven, free-text).
 *   Stage 1 — fetch the REAL OHLCV price/change for each candidate (#468 market-data),
 *             NOT the AI; drop any candidate with no resolvable price.
 *   Pass 2 — SUPPLY those real prices and have the model RANK with them, emitting the
 *             structured pick/watch/avoid + grounded prose (etfsResultJsonSchema).
 *             `expenseRatio` stays model-authored (a fund attribute, per #626).
 *   Overlay — attach the real price/change to each ranked ETF for the response.
 *
 * Async (the two-pass Live flow runs > API Gateway's 29s limit): the sync POST
 * writes a pending job, self-invokes this Lambda (Event), and returns a jobId; the
 * executor writes the finished result to job-results and pushes `job_complete` over
 * WSS — the same pattern as runRecommendations. The thin-UI reads `job-{jobId}`.
 */
import { randomUUID } from 'crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import {
  withAuth,
  ok,
  badRequest,
  requireAccountData,
  type APIGatewayProxyEvent,
} from '@transformotion/lambda-middleware';
import {
  createAiProvider,
  resolveAiRuntimeConfig,
  writeJobResult,
  pushJobComplete,
  type AiProvider,
  type ResolvedAiRuntimeConfig,
} from '@transformotion/fn-ai-proxy-core';
import { etfsResultJsonSchema } from '@transformotion/contracts/stock-analyser/structured-output';
import {
  isEtfMarket,
  ETF_MARKET_LABELS,
  type RunEtfsRequest,
  type EtfModelOutput,
  type Etf,
  type RunEtfsResponse,
} from '@transformotion/contracts/stock-analyser/etfs';

const APP_SLUG = 'stock-analyser';
const CANDIDATE_COUNT = 8; // proposed before price-filtering; the UI renders what survives
const lambda = new LambdaClient({});
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const saData = requireAccountData('stock-analyser');

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

interface RuntimeEnv {
  jobResultsTable: string;
  aiConfigTable: string;
  appAiConfigTable: string;
  anthropicSecretName: string;
  openaiSecretName: string;
  fallbackProvider: string;
  fallbackModel: string;
  marketDataFunctionName: string;
  selfFunctionName: string;
  wsApiEndpoint: string;
  // #594: analysis-cache Lambda for the warm SHARED ETF# write (service-principal).
  analysisCacheFunctionName: string;
}

function env(): RuntimeEnv {
  return {
    jobResultsTable: requireEnv('JOB_RESULTS_TABLE'),
    aiConfigTable: requireEnv('AI_CONFIG_TABLE'),
    appAiConfigTable: requireEnv('APP_AI_CONFIG_TABLE'),
    anthropicSecretName: requireEnv('ANTHROPIC_SECRET_NAME'),
    openaiSecretName: requireEnv('OPENAI_SECRET_NAME'),
    fallbackProvider: process.env.AI_FALLBACK_PROVIDER ?? 'claude',
    fallbackModel: process.env.AI_FALLBACK_MODEL ?? 'claude-sonnet-4-6',
    marketDataFunctionName: requireEnv('MARKET_DATA_FUNCTION_NAME'),
    selfFunctionName: requireEnv('SELF_FUNCTION_NAME'),
    wsApiEndpoint: requireEnv('WS_API_ENDPOINT'),
    analysisCacheFunctionName: requireEnv('ANALYSIS_CACHE_FUNCTION_NAME'),
  };
}

const ETFS_TTL_SECONDS = 48 * 60 * 60; // matches the ETF# cache convention (48h)

// ── Self-invoked async job event ────────────────────────────────────────────────
interface EtfsJobEvent {
  __etfsJob: true;
  jobId: string;
  accountId: string;
  connectionId?: string;
  request: RunEtfsRequest;
}
function isEtfsJobEvent(event: unknown): event is EtfsJobEvent {
  return !!event && (event as EtfsJobEvent).__etfsJob === true;
}

// ── #594 warm event (from the notification-engine, service-principal) ─────────────
// Runs the SAME engine core a live tab run does, then SHARED-writes ETF#{market}
// instead of a per-job result + WSS push. No accountId/connectionId — it's a cache warm.
interface WarmEtfsEvent {
  __warmEtfs: true;
  request: RunEtfsRequest;
  cacheKey: string; // e.g. ETF#ASX
}
function isWarmEtfsEvent(event: unknown): event is WarmEtfsEvent {
  return !!event && (event as WarmEtfsEvent).__warmEtfs === true;
}

// ── AI provider ────────────────────────────────────────────────────────────────
async function makeProvider(runtime: RuntimeEnv): Promise<{ provider: AiProvider; config: ResolvedAiRuntimeConfig }> {
  const config = await resolveAiRuntimeConfig({
    appSlug: APP_SLUG,
    tableName: runtime.aiConfigTable,
    appOverrideTableName: runtime.appAiConfigTable,
    appOverrideKey: { pk: 'AI_CONFIG', sk: `APP#${APP_SLUG}` },
    fallbackProvider: runtime.fallbackProvider,
    fallbackModel: runtime.fallbackModel,
    client: ddb,
  });
  return {
    config,
    provider: createAiProvider(config.provider, {
      anthropicSecretName: runtime.anthropicSecretName,
      openaiSecretName: runtime.openaiSecretName,
      provider: config.provider,
      model: config.model,
    }),
  };
}

// ── Stage 1: real OHLCV price/change (NOT the AI) ────────────────────────────────
interface EtfCandidate {
  ticker: string;
  name: string;
  category: string;
  expenseRatio: number;
}
interface PricedCandidate extends EtfCandidate {
  price: number;
  change: number;
}

async function fetchPrice(runtime: RuntimeEnv, ticker: string): Promise<{ price: number; change: number } | null> {
  try {
    const res = await lambda.send(new InvokeCommand({
      FunctionName: runtime.marketDataFunctionName,
      InvocationType: 'RequestResponse',
      Payload: Buffer.from(JSON.stringify({
        servicePrincipal: 'stock-analyser-etfs',
        operation: 'get-ohlcv',
        ticker,
        range: '1mo',
        interval: '1d',
      })),
    }));
    if (res.FunctionError) return null;
    const payload = res.Payload ? JSON.parse(Buffer.from(res.Payload).toString('utf8')) : null;
    const closes = (payload as { closes?: unknown } | null)?.closes;
    if (!Array.isArray(closes) || closes.length < 2) return null;
    const last = Number(closes[closes.length - 1]);
    const prev = Number(closes[closes.length - 2]);
    if (!Number.isFinite(last) || !Number.isFinite(prev) || prev === 0) return null;
    return { price: last, change: ((last - prev) / prev) * 100 };
  } catch {
    return null;
  }
}

// ── Two-pass prompts ─────────────────────────────────────────────────────────────
const SYSTEM_PROMPT =
  'You are an ETF analyst producing a shortlist of ETF candidates. Respond with raw JSON only. Do not use markdown code fences.';

function proposePrompt(req: RunEtfsRequest): string {
  return (
    `Propose ${CANDIDATE_COUNT} candidate ETFs to consider for a shortlist in the ${ETF_MARKET_LABELS[req.market]} market. ` +
    `Use tickers in that market's convention (e.g. "VAS.AX" for ASX, "SPY" for US). Only propose candidates; do not rank ` +
    `or judge them yet. Return a JSON object with a "candidates" array; each item has ticker, name, category (one of ` +
    `Index / Sector / Bond / Thematic / Property), and expenseRatio (a decimal, e.g. 0.10 for a 0.10% MER). Return ONLY valid JSON.`
  );
}

function rankPrompt(req: RunEtfsRequest, priced: PricedCandidate[]): string {
  const supplied = priced
    .map((c) => `- ${c.ticker} (${c.name}, ${c.category}, MER ${c.expenseRatio}): real price ${c.price.toFixed(2)}, change ${c.change >= 0 ? '+' : ''}${c.change.toFixed(2)}%`)
    .join('\n');
  return (
    `Judge these candidate ETFs for a shortlist in the ${ETF_MARKET_LABELS[req.market]} market. For EACH candidate, assign a ` +
    `recommendationSignal — "pick" (a shortlist candidate), "watch" (on the radar, not yet a candidate), or "avoid" ` +
    `(explicitly not a candidate now) — and a 2-3 sentence analysis.\n\n` +
    `The REAL current market price is SUPPLIED for each ETF below; base your judgment and any price/value reasoning on ` +
    `THESE real prices, not on estimated or recalled prices. Do NOT author price/change in the output. You DO author ` +
    `expenseRatio (a fund attribute).\n\n` +
    `PROSE CONSTRAINT — reason on GROUNDED facts only: the supplied real price, fees (expense ratio), category, yield, ` +
    `and asset size. Do NOT assert precise unverified technicals (no specific moving-average positions, no exact RSI ` +
    `values) you have not grounded. Qualitative reasoning is fine; invented technical specifics are not.\n\n` +
    `SUPPLIED CANDIDATES WITH REAL PRICES:\n${supplied}\n\n` +
    `Return a JSON object with an "etfs" array; each item has ticker, name, category, expenseRatio, recommendationSignal, ` +
    `and analysis. Return ONLY valid JSON.`
  );
}

function parseJsonContent<T>(content: string): T {
  const stripped = content.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
  return JSON.parse(stripped) as T;
}

// ── Engine core (reused by the async job AND the #594 warm path) ─────────────────
interface ComputeResult {
  response: RunEtfsResponse;
  provider: string;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
}

// Propose → real-price → rank. Throws on a hard failure (incl. no priced candidate).
async function computeEtfs(request: RunEtfsRequest, runtime: RuntimeEnv): Promise<ComputeResult> {
  const { provider, config } = await makeProvider(runtime);
  const webSearch = request.searchMode === 'live';

  // Pass 1 — propose candidates. FREE-TEXT so a Live proposal is a single web-search
  // call (the reliable free-text path), not the fragile structured-Live two-pass.
  const proposal = await provider.generate({
    prompt: proposePrompt(request),
    system: SYSTEM_PROMPT,
    model: config.model,
    webSearch,
  });
  const candidates = (parseJsonContent<{ candidates?: EtfCandidate[] }>(proposal.content).candidates ?? [])
    .filter((c) => c?.ticker);

  // Stage 1 — real prices; drop candidates without a resolvable price (the contract's
  // Etf.price is required, never model-authored).
  const priced = (
    await Promise.all(
      candidates.map(async (c): Promise<PricedCandidate | null> => {
        const q = await fetchPrice(runtime, c.ticker.trim());
        return q ? { ...c, price: q.price, change: q.change } : null;
      }),
    )
  ).filter((c): c is PricedCandidate => c !== null);

  if (priced.length === 0) {
    throw new Error('No candidate ETF had resolvable market-data prices.');
  }

  // Pass 2 — rank WITH the supplied real prices. STRUCTURED (strict etfs schema) +
  // single-pass (Fast, no web search): the grounded inputs are already in hand (fresh
  // Live candidates + REAL prices), so ranking needs no own search.
  const ranked = await provider.generate({
    prompt: rankPrompt(request, priced),
    system: SYSTEM_PROMPT,
    model: config.model,
    webSearch: false,
    responseSchema: etfsResultJsonSchema,
  });
  const modelOutputs = parseJsonContent<{ etfs?: EtfModelOutput[] }>(ranked.content).etfs ?? [];

  // Overlay the real price/change onto each ranked ETF; keep only those we priced.
  const priceByTicker = new Map(priced.map((c) => [c.ticker.toUpperCase(), c]));
  const etfs: Etf[] = modelOutputs
    .map((m): Etf | null => {
      const p = priceByTicker.get(m.ticker?.toUpperCase?.() ?? '');
      return p ? { ...m, price: p.price, change: p.change } : null;
    })
    .filter((e): e is Etf => e !== null);

  return {
    response: { etfs, generatedAt: new Date().toISOString() },
    provider: config.provider,
    model: config.model,
    usage: { inputTokens: proposal.inputTokens + ranked.inputTokens, outputTokens: proposal.outputTokens + ranked.outputTokens },
  };
}

// ── Async job: compute → write job result + WSS push (the live tab path) ─────────
async function executeEtfsJob(job: EtfsJobEvent, runtime: RuntimeEnv): Promise<void> {
  const writeStatus = (payload: Record<string, unknown>) =>
    writeJobResult({ tableName: runtime.jobResultsTable, accountId: job.accountId, jobId: job.jobId, payload, client: ddb });

  try {
    const { response, provider, model, usage } = await computeEtfs(job.request, runtime);
    await writeStatus({ status: 'complete', content: JSON.stringify(response), provider, model, usage });
  } catch (err) {
    await writeStatus({ status: 'error', message: err instanceof Error ? err.message : 'ETFs engine failed' }).catch(() => undefined);
  }

  // Notify the client (success OR failure) so it never hangs (the #614 lesson).
  if (job.connectionId) {
    try {
      await pushJobComplete({ endpoint: runtime.wsApiEndpoint, connectionId: job.connectionId, jobId: job.jobId });
    } catch (pushErr) {
      console.warn('[etfs] WSS push failed:', (pushErr as Error).message);
    }
  }
}

// ── #594 warm: compute (SAME engine as live) → SHARED-write ETF#{cacheKey} ────────
async function writeSharedEtfsCache(runtime: RuntimeEnv, cacheKey: string, data: unknown): Promise<void> {
  const res = await lambda.send(new InvokeCommand({
    FunctionName: runtime.analysisCacheFunctionName,
    InvocationType: 'RequestResponse',
    Payload: Buffer.from(JSON.stringify({
      servicePrincipal: 'stock-analyser-etfs',
      operation: 'put-shared-cache',
      cacheKey,
      data,
      ttlSeconds: ETFS_TTL_SECONDS,
      mode: 'live',
      type: 'etfs',
    })),
  }));
  if (res.FunctionError) {
    const payload = res.Payload ? Buffer.from(res.Payload).toString('utf8') : '';
    throw new Error(`etfs cache service-principal write failed: ${res.FunctionError} ${payload}`);
  }
}

async function executeWarmEtfs(event: WarmEtfsEvent, runtime: RuntimeEnv): Promise<void> {
  try {
    const { response } = await computeEtfs(event.request, runtime);
    await writeSharedEtfsCache(runtime, event.cacheKey, response);
    console.log(JSON.stringify({ message: 'etfs-warm-ok', cacheKey: event.cacheKey, count: response.etfs.length }));
  } catch (err) {
    // Per-scope isolation: a warm failure is logged, never thrown (one market must not
    // affect others; the live tab still computes on demand).
    console.log(JSON.stringify({ message: 'etfs-warm-error', cacheKey: event.cacheKey, err: String(err) }));
  }
}

// ── Sync API handler: validate + kick the async job ──────────────────────────────
const apiHandler = withAuth(async ({ auth, account, event }) => {
  saData.read(auth, account.accountId);

  const body = JSON.parse(event.body || '{}') as Partial<RunEtfsRequest> & { connectionId?: string };
  const { market, searchMode, connectionId } = body;
  if (!isEtfMarket(market) || (searchMode !== 'fast' && searchMode !== 'live')) {
    throw badRequest('market (ASX|US|Global) and searchMode (fast|live) are required');
  }

  const runtime = env();
  const jobId = randomUUID();
  await writeJobResult({ tableName: runtime.jobResultsTable, accountId: account.accountId, jobId, payload: { status: 'pending' }, client: ddb });
  await lambda.send(new InvokeCommand({
    FunctionName: runtime.selfFunctionName,
    InvocationType: 'Event',
    Payload: Buffer.from(JSON.stringify({
      __etfsJob: true,
      jobId,
      accountId: account.accountId,
      connectionId,
      request: { market, searchMode },
    } satisfies EtfsJobEvent)),
  }));

  return ok({ jobId });
});

export const handler = async (event: unknown): Promise<unknown> => {
  if (isWarmEtfsEvent(event)) {
    await executeWarmEtfs(event, env());
    return { statusCode: 200 };
  }
  if (isEtfsJobEvent(event)) {
    await executeEtfsJob(event, env());
    return { statusCode: 200 };
  }
  return apiHandler(event as APIGatewayProxyEvent);
};
