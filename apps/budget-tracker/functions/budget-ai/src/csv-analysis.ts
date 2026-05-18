import { ok } from '@transformotion/lambda-middleware';
import type { AuthClaims } from '@transformotion/lambda-middleware';
import { parseBody } from '@transformotion/lambda-middleware';
import type { AiCsvAnalysisResponse } from '@transformotion/budget-domain';
import { invokeProxy } from './proxy';

const AI_MODEL = 'claude-sonnet-4-20250514';

export async function csvAnalysis(
  auth: AuthClaims,
  accountId: string,
  event: Parameters<typeof parseBody>[0],
) {
  const { sampleRows } = parseBody<{ sampleRows: string[][] }>(event);

  const proxyResponse = await invokeProxy(auth, accountId, {
    model:     AI_MODEL,
    maxTokens: 1024,
    system:    `You are a CSV format detective. Given the first few rows of a bank transaction CSV, identify which column is which.\n\nYou must return ONLY a JSON object with this exact shape:\n{\n  "dateColumn": <int>,\n  "descriptionColumn": <int>,\n  "amountColumn": <int>,\n  "debitColumn": <int>,\n  "creditColumn": <int>,\n  "dateFormat": <string>,\n  "hasHeader": <bool>,\n  "confidence": "high" | "medium" | "low",\n  "notes": <string>\n}\n\nEither amountColumn OR (debitColumn + creditColumn) must be present, not both. Columns are 0-indexed.\n\nIf you cannot determine the format with reasonable confidence, set confidence: "low" and describe the issue in notes.\n\nDo not include any text outside the JSON object.\nDo not wrap the JSON in markdown code fences.`,
    prompt:    `Sample rows from uploaded CSV (each row is an array of cell values):\n${JSON.stringify(sampleRows, null, 2)}\n\nThe first row above MAY be a header row, or it may be a data row. Use the content to decide.`,
  });

  const text = (proxyResponse['content'] as string) ?? '';

  try {
    const clean = text.replace(/```json|```/g, '').trim();
    const result = JSON.parse(clean) as AiCsvAnalysisResponse;
    return ok(result);
  } catch {
    console.error('[budget-ai] csv-analysis: failed to parse response', text.slice(0, 200));
    throw { statusCode: 502, message: 'Failed to parse AI response for CSV analysis' };
  }
}
