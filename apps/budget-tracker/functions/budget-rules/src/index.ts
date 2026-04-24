import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  QueryCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  withAuth,
  parseBody,
  getPathParam,
  ok,
  notFound,
  requireGroup,
  type APIGatewayProxyEvent,
} from '@transformotion/lambda-middleware';
import { randomUUID } from 'crypto';
import type { CustomRule } from '@transformotion/budget-domain';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.RULES_TABLE!;

// ── GET /api/budget/v1/rules ──────────────────────────────────────────────────
async function listRules(accountId: string) {
  const res = await ddb.send(new QueryCommand({
    TableName: TABLE,
    KeyConditionExpression: 'accountId = :aid',
    ExpressionAttributeValues: { ':aid': accountId },
  }));
  return ok({ rules: res.Items ?? [] });
}

// ── POST /api/budget/v1/rules ─────────────────────────────────────────────────
async function createRule(event: APIGatewayProxyEvent, accountId: string) {
  const body = parseBody<Pick<CustomRule, 'match' | 'category' | 'subcategory' | 'learned'>>(event);
  if (!body.match?.trim()) throw { statusCode: 400, message: 'match is required' };
  if (!body.category?.trim()) throw { statusCode: 400, message: 'category is required' };

  const rule: CustomRule = {
    id: randomUUID(),
    accountId,
    match: body.match.trim(),
    category: body.category.trim(),
    subcategory: body.subcategory?.trim() ?? '',
    learned: body.learned ?? false,
    createdAt: new Date().toISOString(),
  };

  await ddb.send(new PutCommand({ TableName: TABLE, Item: { ...rule, ruleId: rule.id } }));
  return ok({ rule });
}

// ── PATCH /api/budget/v1/rules/:id ───────────────────────────────────────────
async function updateRule(event: APIGatewayProxyEvent, accountId: string, ruleId: string) {
  const body = parseBody<Partial<Pick<CustomRule, 'match' | 'category' | 'subcategory'>>>(event);

  const expressions: string[] = [];
  const names: Record<string, string> = {};
  const values: Record<string, unknown> = { ':aid': accountId };

  if (body.match !== undefined) { expressions.push('#match = :match'); names['#match'] = 'match'; values[':match'] = body.match.trim(); }
  if (body.category !== undefined) { expressions.push('category = :cat'); values[':cat'] = body.category.trim(); }
  if (body.subcategory !== undefined) { expressions.push('subcategory = :sub'); values[':sub'] = body.subcategory.trim(); }
  if (expressions.length === 0) throw { statusCode: 400, message: 'No fields to update' };

  const res = await ddb.send(new UpdateCommand({
    TableName: TABLE,
    Key: { accountId, ruleId },
    UpdateExpression: `SET ${expressions.join(', ')}`,
    ExpressionAttributeNames: Object.keys(names).length ? names : undefined,
    ExpressionAttributeValues: values,
    ConditionExpression: 'accountId = :aid',
    ReturnValues: 'ALL_NEW',
  }));

  const item = res.Attributes;
  if (!item) throw notFound(`Rule ${ruleId} not found`);
  return ok({ rule: { ...item, id: item['ruleId'] } });
}

// ── DELETE /api/budget/v1/rules/:id ──────────────────────────────────────────
async function deleteRule(accountId: string, ruleId: string) {
  await ddb.send(new DeleteCommand({
    TableName: TABLE,
    Key: { accountId, ruleId },
    ConditionExpression: 'accountId = :aid',
    ExpressionAttributeValues: { ':aid': accountId },
  }));
  return ok({ deleted: true });
}

// ── Handler ───────────────────────────────────────────────────────────────────
export const handler = withAuth(async ({ auth, account, event }) => {
  requireGroup(auth, 'budget-app', 'budget-app-access', 'admin', 'site-admin');
  const { accountId } = account;
  const method = event.httpMethod;
  const resource = event.resource ?? '';

  if (resource === '/api/budget/v1/rules' && method === 'GET')  return listRules(accountId);
  if (resource === '/api/budget/v1/rules' && method === 'POST') return createRule(event, accountId);

  const ruleId = getPathParam(event, 'id');
  if (method === 'PATCH')  return updateRule(event, accountId, ruleId);
  if (method === 'DELETE') return deleteRule(accountId, ruleId);

  throw { statusCode: 400, message: `Unrecognised route: ${method} ${resource}` };
});
