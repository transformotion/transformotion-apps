import { ApiGatewayManagementApiClient, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';
import type { Category } from '@transformotion/budget-domain';

// ── WebSocket push ────────────────────────────────────────────────────────────

let _wsClient: ApiGatewayManagementApiClient | undefined;

function getWsClient(): ApiGatewayManagementApiClient {
  if (!_wsClient) {
    const apiId  = process.env.WS_API_ID!;
    const stage  = process.env.WS_STAGE!;
    const region = process.env.AWS_REGION_NAME ?? process.env.AWS_REGION!;
    _wsClient = new ApiGatewayManagementApiClient({
      endpoint: `https://${apiId}.execute-api.${region}.amazonaws.com/${stage}`,
      region,
    });
  }
  return _wsClient;
}

export async function pushToConnection(connectionId: string, payload: unknown): Promise<void> {
  try {
    await getWsClient().send(new PostToConnectionCommand({
      ConnectionId: connectionId,
      Data:         Buffer.from(JSON.stringify(payload)),
    }));
  } catch (err) {
    console.warn(`[budget-ai] pushToConnection failed for ${connectionId}:`, (err as Error).message);
  }
}

// ── Concurrency limiter ───────────────────────────────────────────────────────

export async function processWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let idx = 0;

  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await fn(items[i]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

// ── Category label lookup ─────────────────────────────────────────────────────

export function buildLabelLookup(categories: Category[]): Map<string, { categoryId: string; subcategoryId: string }> {
  const map = new Map<string, { categoryId: string; subcategoryId: string }>();
  for (const cat of categories) {
    for (const sub of cat.subcategories) {
      const key = `${cat.name.toLowerCase()}::${sub.name.toLowerCase()}`;
      map.set(key, { categoryId: cat.categoryId, subcategoryId: sub.subcategoryId });
    }
  }
  return map;
}

export function formatCategoryList(categories: Category[]): string {
  return categories
    .filter(cat => !cat.deleted)
    .map(cat => `${cat.name}: ${cat.subcategories.filter(sub => !sub.deleted).map(sub => sub.name).join(', ')}`)
    .join('\n');
}

export function formatTxList(txs: Array<{ index: number; description: string; amount: string }>): string {
  return txs.map(t => `${t.index}: ${t.description} — ${t.amount}`).join('\n');
}
