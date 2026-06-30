/**
 * runRecommendations engine (#592).
 *
 * Two-stage, async, structured — the fix for the historical *pricing-before-verdict*
 * bug (the old client-side free-text call ranked on a hallucinated price, then
 * overlaid the real price only for display).
 *
 *   Pass 1 — propose candidate tickers for the universe/sector/mode (searchMode-driven).
 *   Stage 1 — fetch the REAL OHLCV price/change for each candidate (#468 market-data),
 *             NOT the AI; drop any candidate with no resolvable price.
 *   Pass 2 — SUPPLY those real prices and have the model RANK with them, emitting the
 *             structured pick/watch/avoid + grounded prose (recommendationsResultJsonSchema).
 *   Overlay — attach the real price/change to each ranked candidate for the response.
 *
 * Async (the two-pass Live flow runs ~60-105s, over API Gateway's 29s limit): the
 * sync POST writes a pending job, self-invokes this Lambda (Event), and returns a
 * jobId; the executor writes the finished result to job-results and pushes
 * `job_complete` over WSS — the same pattern as the AI proxy. The thin-UI reads the
 * result from `job-{jobId}` on completion.
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
import { recommendationsResultJsonSchema } from '@transformotion/contracts/stock-analyser/structured-output';
import {
  isRecommendationMode,
  RECOMMENDATION_MODE_LABELS,
  type RunRecommendationsRequest,
  type RecommendationModelOutput,
  type Recommendation,
  type RunRecommendationsResponse,
} from '@transformotion/contracts/stock-analyser/recommendations';

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
  };
}

// ── Self-invoked async job event ────────────────────────────────────────────────
interface RecsJobEvent {
  __recsJob: true;
  jobId: string;
  accountId: string;
  connectionId?: string;
  request: RunRecommendationsRequest;
}
function isRecsJobEvent(event: unknown): event is RecsJobEvent {
  return !!event && (event as RecsJobEvent).__recsJob === true;
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
interface PricedCandidate extends CandidateProposal {
  price: number;
  change: number;
}

async function fetchPrice(runtime: RuntimeEnv, ticker: string): Promise<{ price: number; change: number } | null> {
  try {
    const res = await lambda.send(new InvokeCommand({
      FunctionName: runtime.marketDataFunctionName,
      InvocationType: 'RequestResponse',
      Payload: Buffer.from(JSON.stringify({
        servicePrincipal: 'stock-analyser-recommendations',
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
  'You are a stock analyst producing a shortlist of recommendation candidates. Respond with raw JSON only. Do not use markdown code fences.';

interface CandidateProposal {
  ticker: string;
  company: string;
  sector: string;
  subcategory: string;
}

const candidatesSchema = {
  type: 'object',
  properties: {
    candidates: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        properties: {
          ticker: { type: 'string' },
          company: { type: 'string' },
          sector: { type: 'string' },
          subcategory: { type: 'string' },
        },
        required: ['ticker', 'company', 'sector', 'subcategory'],
        additionalProperties: false,
      },
    },
  },
  required: ['candidates'],
  additionalProperties: false,
} as const;

function proposePrompt(req: RunRecommendationsRequest): string {
  const focus =
    req.mode === 'top-picks'
      ? 'with strong momentum and constructive fundamentals'
      : 'near the bottom of their cycle with credible recovery potential';
  return (
    `Propose ${CANDIDATE_COUNT} candidate stocks to consider for a "${RECOMMENDATION_MODE_LABELS[req.mode]}" shortlist ` +
    `in the ${req.universe} universe${req.sector ? ` focused on the ${req.sector} sector` : ''}, ${focus}. ` +
    `Use tickers in that universe's convention (e.g. "WDS.AX" for ASX). For each candidate return ticker, company, ` +
    `sector, and subcategory. Only propose candidates; do not rank or judge them yet. Return ONLY valid JSON.`
  );
}

function rankPrompt(req: RunRecommendationsRequest, priced: PricedCandidate[]): string {
  const supplied = priced
    .map((c) => `- ${c.ticker} (${c.company}, ${c.sector} / ${c.subcategory}): real price ${c.price.toFixed(2)}, change ${c.change >= 0 ? '+' : ''}${c.change.toFixed(2)}%`)
    .join('\n');
  return (
    `Judge these candidate stocks for a "${RECOMMENDATION_MODE_LABELS[req.mode]}" shortlist in the ${req.universe} universe` +
    `${req.sector ? ` (${req.sector} sector)` : ''}. For EACH candidate, assign a recommendationSignal — "pick" (a shortlist ` +
    `candidate), "watch" (on the radar, not yet a candidate), or "avoid" (explicitly not a candidate now) — and a 2-3 sentence ` +
    `analysis.\n\n` +
    `The REAL current market price is SUPPLIED for each candidate below; base your judgment and any price/value reasoning on ` +
    `THESE real prices, not on estimated or recalled prices. Do NOT author price/change in the output.\n\n` +
    `PROSE CONSTRAINT — reason on GROUNDED facts only: the supplied real price, fundamentals, sector fit, and relative value. ` +
    `Do NOT assert precise unverified technicals (no specific moving-average positions, no exact RSI values) you have not ` +
    `grounded. Qualitative reasoning is fine; invented technical specifics are not.\n\n` +
    `SUPPLIED CANDIDATES WITH REAL PRICES:\n${supplied}\n\n` +
    `Return a JSON object with a "recommendations" array; each item has ticker, company, sector, subcategory, ` +
    `recommendationSignal, and analysis. Return ONLY valid JSON.`
  );
}

function parseJsonContent<T>(content: string): T {
  const stripped = content.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
  return JSON.parse(stripped) as T;
}

// ── Engine ───────────────────────────────────────────────────────────────────────
async function executeRecsJob(job: RecsJobEvent, runtime: RuntimeEnv): Promise<void> {
  const writeStatus = (payload: Record<string, unknown>) =>
    writeJobResult({ tableName: runtime.jobResultsTable, accountId: job.accountId, jobId: job.jobId, payload, client: ddb });

  try {
    const { provider, config } = await makeProvider(runtime);
    const webSearch = job.request.searchMode === 'live';

    // Pass 1 — propose candidates.
    const proposal = await provider.generate({
      prompt: proposePrompt(job.request),
      system: SYSTEM_PROMPT,
      model: config.model,
      webSearch,
      responseSchema: candidatesSchema,
    });
    const candidates = (parseJsonContent<{ candidates?: CandidateProposal[] }>(proposal.content).candidates ?? [])
      .filter((c) => c?.ticker);

    // Stage 1 — real prices; drop candidates without a resolvable price (the contract's
    // Recommendation.price is required, never model-authored).
    const priced = (
      await Promise.all(
        candidates.map(async (c): Promise<PricedCandidate | null> => {
          const q = await fetchPrice(runtime, c.ticker.trim());
          return q ? { ...c, price: q.price, change: q.change } : null;
        }),
      )
    ).filter((c): c is PricedCandidate => c !== null);

    if (priced.length === 0) {
      await writeStatus({ status: 'error', message: 'No candidate had resolvable market-data prices.' });
    } else {
      // Pass 2 — rank WITH the supplied real prices (structured).
      const ranked = await provider.generate({
        prompt: rankPrompt(job.request, priced),
        system: SYSTEM_PROMPT,
        model: config.model,
        webSearch,
        responseSchema: recommendationsResultJsonSchema,
      });
      const modelOutputs = parseJsonContent<{ recommendations?: RecommendationModelOutput[] }>(ranked.content).recommendations ?? [];

      // Overlay the real price/change onto each ranked candidate; keep only those we priced.
      const priceByTicker = new Map(priced.map((c) => [c.ticker.toUpperCase(), c]));
      const recommendations: Recommendation[] = modelOutputs
        .map((m): Recommendation | null => {
          const p = priceByTicker.get(m.ticker?.toUpperCase?.() ?? '');
          return p ? { ...m, price: p.price, change: p.change } : null;
        })
        .filter((r): r is Recommendation => r !== null);

      const response: RunRecommendationsResponse = { recommendations, generatedAt: new Date().toISOString() };
      await writeStatus({
        status: 'complete',
        content: JSON.stringify(response),
        provider: config.provider,
        model: config.model,
        usage: { inputTokens: proposal.inputTokens + ranked.inputTokens, outputTokens: proposal.outputTokens + ranked.outputTokens },
      });
    }
  } catch (err) {
    await writeStatus({ status: 'error', message: err instanceof Error ? err.message : 'Recommendations engine failed' }).catch(() => undefined);
  }

  // Notify the client (success OR failure) so it never hangs (the #614 lesson).
  if (job.connectionId) {
    try {
      await pushJobComplete({ endpoint: runtime.wsApiEndpoint, connectionId: job.connectionId, jobId: job.jobId });
    } catch (pushErr) {
      console.warn('[recommendations] WSS push failed:', (pushErr as Error).message);
    }
  }
}

// ── Sync API handler: validate + kick the async job ──────────────────────────────
const apiHandler = withAuth(async ({ auth, account, event }) => {
  saData.read(auth, account.accountId);

  const body = JSON.parse(event.body || '{}') as Partial<RunRecommendationsRequest> & { connectionId?: string };
  const { universe, mode, sector, searchMode, connectionId } = body;
  if (!universe || !isRecommendationMode(mode) || (searchMode !== 'fast' && searchMode !== 'live')) {
    throw badRequest('universe, mode (top-picks|bottom-of-cycle), and searchMode (fast|live) are required');
  }

  const runtime = env();
  const jobId = randomUUID();
  await writeJobResult({ tableName: runtime.jobResultsTable, accountId: account.accountId, jobId, payload: { status: 'pending' }, client: ddb });
  await lambda.send(new InvokeCommand({
    FunctionName: runtime.selfFunctionName,
    InvocationType: 'Event',
    Payload: Buffer.from(JSON.stringify({
      __recsJob: true,
      jobId,
      accountId: account.accountId,
      connectionId,
      request: { universe, mode, sector, searchMode },
    } satisfies RecsJobEvent)),
  }));

  return ok({ jobId });
});

export const handler = async (event: unknown): Promise<unknown> => {
  if (isRecsJobEvent(event)) {
    await executeRecsJob(event, env());
    return { statusCode: 200 };
  }
  return apiHandler(event as APIGatewayProxyEvent);
};
