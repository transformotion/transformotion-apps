import type { AuthClaims } from '@transformotion/lambda-middleware';
import type { Category, WsMessageBatchResult, WsMessageComplete, WsMessageError } from '@transformotion/budget-domain';
import { invokeProxy } from './proxy';
import { putCachedReview } from './review-cache';
import { pushToConnection, processWithConcurrency, buildLabelLookup, formatCategoryList, formatTxList } from './shared';

export interface ReviewWorkerPayload {
  __asyncJob:    'review-worker';
  jobId:         string;
  userId:        string;
  accountId:     string;
  connectionId:  string;
  transactions:  Array<{ index: number; description: string; amount: string }>;
  categories:    Category[];
  batchSize:     number;
  parallelLimit: number;
  confidenceThreshold: 'low' | 'medium' | 'high';
  forceFullSearch: boolean;
  transactionsHash: string;
  auth:          AuthClaims;
}

type BatchResult = {
  index: number;
  categoryId: string;
  subcategoryId: string;
  reason: string;
  confidence: 'high' | 'medium' | 'low';
};

const CONFIDENCE_ORDER: Record<string, number> = { high: 2, medium: 1, low: 0 };

function meetsThreshold(confidence: string, threshold: 'low' | 'medium' | 'high'): boolean {
  return CONFIDENCE_ORDER[confidence] >= CONFIDENCE_ORDER[threshold];
}

async function runBatch(
  auth: AuthClaims,
  accountId: string,
  batch: Array<{ index: number; description: string; amount: string }>,
  categoryList: string,
  labelLookup: Map<string, { categoryId: string; subcategoryId: string }>,
  webSearch: boolean,
): Promise<BatchResult[]> {
  const proxyResponse = await invokeProxy(auth, accountId, {
    maxTokens: 4096,
    webSearch,
    system:    `You are a personal finance assistant helping to categorise Australian bank transactions.\n\nYou will be given:\n- A list of budget categories, each with allowed subcategories\n- A list of transactions (index, description, amount)\n\n${webSearch ? 'You have access to a web_search tool. If a merchant or description is unfamiliar, you MAY search to identify the business type. Use web_search sparingly.' : ''}\n\nWhen a merchant could plausibly belong to multiple categories, use the transaction amount as a disambiguating signal. Smaller amounts at hospitality venues (pubs, bars, cafes) typically indicate drinks or snacks; larger amounts typically indicate meals. Smaller amounts at petrol stations may indicate convenience-store items; larger amounts indicate fuel. Smaller amounts at supermarkets may indicate a quick convenience purchase; larger amounts indicate a full grocery shop. Use your judgement based on typical Australian prices.\n\nYou must:\n- Return ONLY a JSON array, one object per transaction\n- Each object has exactly: {"index": <int>, "category": <string>, "subcategory": <string>, "reason": <string>, "confidence": "high"|"medium"|"low"}\n- The category must be one of the provided categories exactly\n- The subcategory must be one of the subcategories listed under that category exactly\n- "confidence" reflects how certain you are: "high" = clear match, "medium" = reasonable inference, "low" = best guess\n- The reason must be a single sentence explaining your choice in plain English, and should mention the amount where it influenced the decision\n- If a transaction is genuinely uncategorisable, return it with category: "", subcategory: "", confidence: "low", and reason explaining why\n- Do not include any text outside the JSON array\n- Do not wrap the JSON in markdown code fences`,
    prompt:    `BUDGET CATEGORIES AND SUBCATEGORIES:\n${categoryList}\n\nTRANSACTIONS TO CATEGORISE (index: description — amount):\n${formatTxList(batch)}`,
  });

  const text = (proxyResponse['content'] as string) ?? '';
  const results: BatchResult[] = [];

  try {
    const clean = text.replace(/```json|```/g, '').trim();
    const rawSuggestions = JSON.parse(
      clean.slice(clean.indexOf('['), clean.lastIndexOf(']') + 1)
    ) as Array<{ index: number; category: string; subcategory: string; reason: string; confidence: string }>;

    for (const s of rawSuggestions) {
      const key = `${s.category.toLowerCase()}::${s.subcategory.toLowerCase()}`;
      const ids = labelLookup.get(key);
      if (!ids) {
        console.warn(`[budget-ai] review-worker: could not resolve "${s.category} > ${s.subcategory}" at index ${s.index}`);
        continue;
      }
      results.push({
        index:         s.index,
        categoryId:    ids.categoryId,
        subcategoryId: ids.subcategoryId,
        reason:        s.reason,
        confidence:    (s.confidence as 'high' | 'medium' | 'low') ?? 'low',
      });
    }
  } catch {
    console.error('[budget-ai] review-worker: failed to parse batch', text.slice(0, 200));
  }

  return results;
}

export async function runReviewWorker(payload: ReviewWorkerPayload): Promise<void> {
  const { jobId, connectionId, transactions, categories, batchSize, parallelLimit, auth, accountId, forceFullSearch, transactionsHash } = payload;
  // forceFullSearch overrides the user's stored threshold for this run only
  const confidenceThreshold: 'low' | 'medium' | 'high' = forceFullSearch ? 'high' : payload.confidenceThreshold;

  const categoryList = formatCategoryList(categories);
  const labelLookup  = buildLabelLookup(categories);

  const pass1Results = new Map<number, BatchResult>();
  const emittedBatches: WsMessageBatchResult[] = [];
  const totalCount   = transactions.length;
  let completedCount = 0;

  // ── Pass 1: fast, no webSearch ────────────────────────────────────────────

  const batches1: Array<typeof transactions> = [];
  for (let i = 0; i < transactions.length; i += batchSize) {
    batches1.push(transactions.slice(i, i + batchSize));
  }

  try {
    await processWithConcurrency(batches1, parallelLimit, async (batch) => {
      const batchResults = await runBatch(auth, accountId, batch, categoryList, labelLookup, false);
      for (const r of batchResults) pass1Results.set(r.index, r);

      completedCount += batch.length;
      const msg: WsMessageBatchResult = {
        type:           'batch_result',
        jobId,
        pass:           1,
        results:        batchResults,
        completedCount,
        totalCount,
      };
      emittedBatches.push(msg);
      await pushToConnection(connectionId, msg);
    });

    // ── Pass 2: web search for low-confidence results ─────────────────────

    const needsPass2 = transactions.filter(tx => {
      const r = pass1Results.get(tx.index);
      return !r || !meetsThreshold(r.confidence, confidenceThreshold);
    });

    if (needsPass2.length > 0) {
      const batches2: Array<typeof transactions> = [];
      for (let i = 0; i < needsPass2.length; i += batchSize) {
        batches2.push(needsPass2.slice(i, i + batchSize));
      }

      let pass2Completed = 0;
      await processWithConcurrency(batches2, parallelLimit, async (batch) => {
        const batchResults = await runBatch(auth, accountId, batch, categoryList, labelLookup, true);
        for (const r of batchResults) pass1Results.set(r.index, r);

        pass2Completed += batch.length;
        const msg: WsMessageBatchResult = {
          type:           'batch_result',
          jobId,
          pass:           2,
          results:        batchResults,
          completedCount: pass2Completed,
          totalCount:     needsPass2.length,
        };
        emittedBatches.push(msg);
        await pushToConnection(connectionId, msg);
      });
    }

    await putCachedReview(process.env.AI_CACHE_TABLE, accountId, transactionsHash, emittedBatches);

    const complete: WsMessageComplete = { type: 'complete', jobId };
    await pushToConnection(connectionId, complete);

  } catch (err) {
    console.error('[budget-ai] review-worker: fatal error', err);
    const errorMsg: WsMessageError = {
      type:    'error',
      jobId,
      message: (err as Error).message ?? 'Internal error during AI review',
    };
    await pushToConnection(connectionId, errorMsg);
  }
}
