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
  requireAppAccess,
  requireAccountAccess,
  type APIGatewayProxyEvent,
} from '@transformotion/lambda-middleware';
import { randomUUID } from 'crypto';
import type { MatchingRule } from '@transformotion/budget-domain';

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
  const body = parseBody<Partial<Omit<MatchingRule, 'ruleId' | 'accountId' | 'createdAt'>>>(event);
  if (!body.match?.trim())       throw { statusCode: 400, message: 'match is required' };
  if (!body.categoryId?.trim())  throw { statusCode: 400, message: 'categoryId is required' };
  if (!body.subcategoryId?.trim()) throw { statusCode: 400, message: 'subcategoryId is required' };

  const rule: MatchingRule = {
    ruleId:       randomUUID(),
    accountId,
    name:         body.name?.trim() ?? body.match.trim(),
    match:        body.match.trim(),
    matchType:    body.matchType ?? 'contains',
    categoryId:   body.categoryId.trim(),
    subcategoryId: body.subcategoryId.trim(),
    enabled:      body.enabled ?? true,
    priority:     body.priority ?? 100,
    isBusiness:   body.isBusiness ?? false,
    learned:      body.learned ?? false,
    createdAt:    new Date().toISOString(),
  };

  await ddb.send(new PutCommand({ TableName: TABLE, Item: { ...rule } }));
  return ok({ rule });
}

// ── PATCH /api/budget/v1/rules/:id ───────────────────────────────────────────
async function updateRule(event: APIGatewayProxyEvent, accountId: string, ruleId: string) {
  const body = parseBody<Partial<Omit<MatchingRule, 'ruleId' | 'accountId' | 'createdAt'>>>(event);

  const expressions: string[] = [];
  const names: Record<string, string> = {};
  const values: Record<string, unknown> = { ':aid': accountId };

  if (body.match !== undefined)         { expressions.push('#match = :match');       names['#match'] = 'match';   values[':match'] = body.match.trim(); }
  if (body.name !== undefined)          { expressions.push('#name = :name');         names['#name']  = 'name';    values[':name']  = body.name.trim(); }
  if (body.matchType !== undefined)     { expressions.push('matchType = :mtype');                                  values[':mtype'] = body.matchType; }
  if (body.categoryId !== undefined)    { expressions.push('categoryId = :catId');                                 values[':catId'] = body.categoryId.trim(); }
  if (body.subcategoryId !== undefined) { expressions.push('subcategoryId = :subId');                              values[':subId'] = body.subcategoryId.trim(); }
  if (body.enabled !== undefined)       { expressions.push('enabled = :enabled');                                  values[':enabled'] = body.enabled; }
  if (body.priority !== undefined)      { expressions.push('priority = :priority');                                values[':priority'] = body.priority; }
  if (body.isBusiness !== undefined)    { expressions.push('isBusiness = :biz');                                   values[':biz']  = body.isBusiness; }
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

  if (!res.Attributes) throw notFound(`Rule ${ruleId} not found`);
  return ok({ rule: { ...res.Attributes } });
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
  requireAppAccess(auth, 'budget-tracker');
  requireAccountAccess(auth, 'budget-tracker', account.accountId);
  const { accountId } = account;
  const method   = event.httpMethod;
  const resource = event.resource ?? '';

  if (resource === '/api/budget/v1/rules' && method === 'GET')  return listRules(accountId);
  if (resource === '/api/budget/v1/rules' && method === 'POST') return createRule(event, accountId);

  const ruleId = getPathParam(event, 'id');
  if (method === 'PATCH')  return updateRule(event, accountId, ruleId);
  if (method === 'DELETE') return deleteRule(accountId, ruleId);

  throw { statusCode: 400, message: `Unrecognised route: ${method} ${resource}` };
});
