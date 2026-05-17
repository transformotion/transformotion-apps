import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { withAuth, parseBody, ok, requireAppAccess, requireAccountAccess } from '@transformotion/lambda-middleware';
import type { AuthClaims } from '@transformotion/lambda-middleware';
import type {
  Category,
  AiReviewResponse,
  AiCsvAnalysisResponse,
} from '@transformotion/budget-domain';

const lambdaClient = new LambdaClient({});
const PROXY_FN     = process.env.CLAUDE_PROXY_FUNCTION_NAME!;
const AI_MODEL     = 'claude-sonnet-4-20250514';
const BATCH_REVIEW = 20;

// ── Invoke the shared claude-proxy Lambda ─────────────────────────────────────
// Formats a minimal API Gateway proxy event so the proxy's withAuth middleware
// can extract claims without requiring a raw JWT token.
async function invokeProxy(
  auth: AuthClaims,
  accountId: string,
  body: object
): Promise<Record<string, unknown>> {
  const fakeEvent = {
    httpMethod: 'POST',
    path: '/api/claude',
    headers: { 'x-account-id': accountId },
    queryStringParameters: null,
    pathParameters: null,
    requestContext: {
      authorizer: {
        claims: {
          sub:              auth.userId,
          email:            auth.email,
          'cognito:groups': auth.groups.join(' '),
          apps:             JSON.stringify(auth.apps),
          accounts:         JSON.stringify(auth.accounts),
          site_admin:       String(auth.siteAdmin),
        },
      },
    },
    body: JSON.stringify(body),
    isBase64Encoded: false,
  };

  const result = await lambdaClient.send(new InvokeCommand({
    FunctionName: PROXY_FN,
    Payload:      Buffer.from(JSON.stringify(fakeEvent)),
  }));

  const response = JSON.parse(Buffer.from(result.Payload!).toString()) as {
    statusCode: number;
    body: string;
  };

  if (response.statusCode !== 200) {
    const err = JSON.parse(response.body || '{}');
    throw { statusCode: response.statusCode, message: err.error ?? 'Claude proxy error' };
  }

  return JSON.parse(response.body) as Record<string, unknown>;
}

function formatCategoryList(categories: Category[]): string {
  return categories
    .filter(cat => !cat.deleted)
    .map(cat => `${cat.name}: ${cat.subcategories.filter(sub => !sub.deleted).map(sub => sub.name).join(', ')}`)
    .join('\n');
}

function formatTxList(txs: Array<{ index: number; description: string; amount: string }>): string {
  return txs.map(t => `${t.index}: ${t.description} — ${t.amount}`).join('\n');
}

// ── POST /api/budget/v1/ai/review ─────────────────────────────────────────────
async function review(
  auth: AuthClaims,
  accountId: string,
  event: Parameters<typeof parseBody>[0]
) {
  const { transactions, categories } = parseBody<{
    transactions: Array<{ index: number; description: string; amount: string }>;
    categories: Category[];
  }>(event);

  const categoryList = formatCategoryList(categories);
  const allResults: AiReviewResponse['results'] = [];

  for (let i = 0; i < transactions.length; i += BATCH_REVIEW) {
    const batch = transactions.slice(i, i + BATCH_REVIEW);
    const proxyResponse = await invokeProxy(auth, accountId, {
      model:      AI_MODEL,
      max_tokens: 4096,
      webSearch:  true,
      system:     `You are a personal finance assistant helping to categorise Australian bank transactions that a fast categorisation pass could not handle.\n\nYou will be given:\n- A list of budget categories, each with allowed subcategories\n- A list of unknown or ambiguous transactions (index, description, amount)\n\nYou have access to a web_search tool. If a merchant or description is unfamiliar, you MAY search to identify the business type before categorising. Use web_search sparingly — only when the description is genuinely ambiguous.\n\nYou must:\n- Return ONLY a JSON array, one object per transaction\n- Each object has exactly: {"index": <int>, "category": <string>, "subcategory": <string>, "reason": <string>}\n- The category must be one of the provided categories exactly\n- The subcategory must be one of the subcategories listed under that category exactly\n- The reason must be a single sentence explaining your choice in plain English\n- If a transaction is genuinely uncategorisable, return it with category: "", subcategory: "", and reason explaining why\n- Do not include any text outside the JSON array\n- Do not wrap the JSON in markdown code fences`,
      messages: [{
        role: 'user',
        content: `BUDGET CATEGORIES AND SUBCATEGORIES:\n${categoryList}\n\nTRANSACTIONS TO CATEGORISE (index: description — amount):\n${formatTxList(batch)}`,
      }],
    });

    const content = proxyResponse['content'] as Array<{ type: string; text?: string }> | undefined;
    const text = (content ?? []).filter(c => c.type === 'text').map(c => c.text ?? '').join('');

    try {
      const clean = text.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(clean.slice(clean.indexOf('['), clean.lastIndexOf(']') + 1)) as AiReviewResponse['results'];
      allResults.push(...parsed);
    } catch {
      console.error('[budget-ai] review: failed to parse batch response', text.slice(0, 200));
    }
  }

  return ok({ results: allResults });
}

// ── POST /api/budget/v1/ai/csv-analysis ──────────────────────────────────────
async function csvAnalysis(
  auth: AuthClaims,
  accountId: string,
  event: Parameters<typeof parseBody>[0]
) {
  const { sampleRows } = parseBody<{ sampleRows: string[][] }>(event);

  const proxyResponse = await invokeProxy(auth, accountId, {
    model:      AI_MODEL,
    max_tokens: 1024,
    system:     `You are a CSV format detective. Given the first few rows of a bank transaction CSV, identify which column is which.\n\nYou must return ONLY a JSON object with this exact shape:\n{\n  "dateColumn": <int>,\n  "descriptionColumn": <int>,\n  "amountColumn": <int>,\n  "debitColumn": <int>,\n  "creditColumn": <int>,\n  "dateFormat": <string>,\n  "hasHeader": <bool>,\n  "confidence": "high" | "medium" | "low",\n  "notes": <string>\n}\n\nEither amountColumn OR (debitColumn + creditColumn) must be present, not both. Columns are 0-indexed.\n\nIf you cannot determine the format with reasonable confidence, set confidence: "low" and describe the issue in notes.\n\nDo not include any text outside the JSON object.\nDo not wrap the JSON in markdown code fences.`,
    messages: [{
      role: 'user',
      content: `Sample rows from uploaded CSV (each row is an array of cell values):\n${JSON.stringify(sampleRows, null, 2)}\n\nThe first row above MAY be a header row, or it may be a data row. Use the content to decide.`,
    }],
  });

  const content = proxyResponse['content'] as Array<{ type: string; text?: string }> | undefined;
  const text = (content ?? []).filter(c => c.type === 'text').map(c => c.text ?? '').join('');

  try {
    const clean = text.replace(/```json|```/g, '').trim();
    const result = JSON.parse(clean) as AiCsvAnalysisResponse;
    return ok(result);
  } catch {
    console.error('[budget-ai] csv-analysis: failed to parse response', text.slice(0, 200));
    throw { statusCode: 502, message: 'Failed to parse AI response for CSV analysis' };
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────
export const handler = withAuth(async ({ auth, account, event }) => {
  requireAppAccess(auth, 'budget-tracker');
  requireAccountAccess(auth, 'budget-tracker', account.accountId);
  const resource = event.resource ?? '';

  if (resource === '/api/budget/v1/ai/review')        return review(auth, account.accountId, event);
  if (resource === '/api/budget/v1/ai/csv-analysis')  return csvAnalysis(auth, account.accountId, event);

  throw { statusCode: 400, message: `Unrecognised route: ${event.httpMethod} ${resource}` };
});
