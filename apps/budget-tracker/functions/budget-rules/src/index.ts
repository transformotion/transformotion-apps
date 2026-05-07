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
  const body = parseBody<Partial<Omit<CustomRule, 'ruleId' | 'accountId' | 'createdAt'>>>(event);
  if (!body.match?.trim()) throw { statusCode: 400, message: 'match is required' };
  if (!body.category?.trim()) throw { statusCode: 400, message: 'category is required' };

  const rule: CustomRule = {
    ruleId: randomUUID(),
    accountId,
    name: body.name?.trim() ?? body.match.trim(),
    match: body.match.trim(),
    matchType: body.matchType ?? 'contains',
    category: body.category.trim(),
    subcategory: body.subcategory?.trim() ?? '',
    enabled: body.enabled ?? true,
    priority: body.priority ?? 100,
    isBusiness: body.isBusiness ?? false,
    isIgnore: body.isIgnore,
    overridesBuiltinId: body.overridesBuiltinId,
    projectId: body.projectId,
    learned: body.learned ?? false,
    createdAt: new Date().toISOString(),
  };

  await ddb.send(new PutCommand({ TableName: TABLE, Item: { ...rule } }));
  return ok({ rule });
}

// ── PATCH /api/budget/v1/rules/:id ───────────────────────────────────────────
async function updateRule(event: APIGatewayProxyEvent, accountId: string, ruleId: string) {
  const body = parseBody<Partial<Omit<CustomRule, 'ruleId' | 'accountId' | 'createdAt'>>>(event);

  const expressions: string[] = [];
  const names: Record<string, string> = {};
  const values: Record<string, unknown> = { ':aid': accountId };

  if (body.match !== undefined)              { expressions.push('#match = :match');       names['#match'] = 'match';   values[':match'] = body.match.trim(); }
  if (body.name !== undefined)               { expressions.push('#name = :name');         names['#name'] = 'name';     values[':name'] = body.name.trim(); }
  if (body.matchType !== undefined)          { expressions.push('matchType = :mtype');                                  values[':mtype'] = body.matchType; }
  if (body.category !== undefined)           { expressions.push('category = :cat');                                     values[':cat'] = body.category.trim(); }
  if (body.subcategory !== undefined)        { expressions.push('subcategory = :sub');                                  values[':sub'] = body.subcategory.trim(); }
  if (body.enabled !== undefined)            { expressions.push('enabled = :enabled');                                  values[':enabled'] = body.enabled; }
  if (body.priority !== undefined)           { expressions.push('priority = :priority');                                values[':priority'] = body.priority; }
  if (body.isBusiness !== undefined)         { expressions.push('isBusiness = :biz');                                  values[':biz'] = body.isBusiness; }
  if (body.isIgnore !== undefined)           { expressions.push('isIgnore = :ignore');                                  values[':ignore'] = body.isIgnore; }
  if (body.overridesBuiltinId !== undefined) { expressions.push('overridesBuiltinId = :obid');                          values[':obid'] = body.overridesBuiltinId; }
  if (body.projectId !== undefined)          { expressions.push('projectId = :pid');                                    values[':pid'] = body.projectId; }
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
  return ok({ rule: { ...item } });
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
  const method = event.httpMethod;
  const resource = event.resource ?? '';

  if (resource === '/api/budget/v1/rules' && method === 'GET')  return listRules(accountId);
  if (resource === '/api/budget/v1/rules' && method === 'POST') return createRule(event, accountId);

  const ruleId = getPathParam(event, 'id');
  if (method === 'PATCH')  return updateRule(event, accountId, ruleId);
  if (method === 'DELETE') return deleteRule(accountId, ruleId);

  throw { statusCode: 400, message: `Unrecognised route: ${method} ${resource}` };
});
