import { beforeEach, describe, expect, it, vi } from 'vitest';

type StoredItem = {
  accountId: string;
  concept: string;
  value: unknown;
  updatedAt?: string;
};

const store = new Map<string, StoredItem>();
const send = vi.fn(async (cmd: { constructor: { name: string }; input: Record<string, unknown> }) => {
  if (cmd.constructor.name === 'QueryCommand') {
    const accountId = (cmd.input.ExpressionAttributeValues as Record<string, string>)[':aid'];
    return {
      Items: [...store.values()].filter(item => item.accountId === accountId),
    };
  }
  if (cmd.constructor.name === 'PutCommand') {
    const item = cmd.input.Item as StoredItem;
    store.set(`${item.accountId}:${item.concept}`, item);
    return {};
  }
  throw new Error(`unexpected command ${cmd.constructor.name}`);
});

vi.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: class DynamoDBClient {},
}));

vi.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: {
    from: () => ({ send }),
  },
  QueryCommand: class QueryCommand {
    constructor(public readonly input: Record<string, unknown>) {}
  },
  PutCommand: class PutCommand {
    constructor(public readonly input: Record<string, unknown>) {}
  },
}));

vi.mock('@transformotion/fn-account-membership', () => ({
  dynamoMembershipLoader: () => vi.fn(),
}));

vi.mock('@transformotion/lambda-middleware', () => ({
  ok: (body: unknown) => ({ statusCode: 200, body: JSON.stringify(body) }),
  parseBody: (event: { body?: string | null }) => (event.body ? JSON.parse(event.body) : {}),
  requireAccountData: () => ({
    read: vi.fn(),
    write: vi.fn(async () => undefined),
  }),
  withAuth: (fn: (args: { auth: unknown; account: { accountId: string }; event: unknown }) => unknown) =>
    (event: unknown) => fn({ auth: {}, account: { accountId: 'acct-1' }, event }),
}));

const baseEvent = (httpMethod: 'GET' | 'PATCH', body?: unknown) => ({
  httpMethod,
  body: body === undefined ? null : JSON.stringify(body),
});

async function invoke(httpMethod: 'GET' | 'PATCH', body?: unknown) {
  const { handler } = await import('./index');
  const res = await handler(baseEvent(httpMethod, body) as never) as { statusCode: number; body: string };
  return JSON.parse(res.body) as { budgetData: Record<string, unknown> };
}

describe('budget-data handler', () => {
  beforeEach(() => {
    store.clear();
    send.mockClear();
    vi.resetModules();
  });

  it('round-trips savingsGoal with a linked subcategory through PATCH then GET', async () => {
    const savingsGoal = { targetAmount: 2500, linkedSubcategoryId: 'sub-emergency' };

    expect((await invoke('PATCH', { savingsGoal })).budgetData.savingsGoal).toEqual(savingsGoal);
    expect((await invoke('GET')).budgetData.savingsGoal).toEqual(savingsGoal);
  });

  it('round-trips savingsGoal with linkedSubcategoryId null', async () => {
    const savingsGoal = { targetAmount: 1200, linkedSubcategoryId: null };

    expect((await invoke('PATCH', { savingsGoal })).budgetData.savingsGoal).toEqual(savingsGoal);
    expect((await invoke('GET')).budgetData.savingsGoal).toEqual(savingsGoal);
  });

  it('leaves stored savingsGoal untouched when a PATCH omits it', async () => {
    const savingsGoal = { targetAmount: 3000, linkedSubcategoryId: 'sub-holiday' };

    await invoke('PATCH', { savingsGoal });
    const afterPatch = await invoke('PATCH', { budgetAmounts: {} });

    expect(afterPatch.budgetData.savingsGoal).toEqual(savingsGoal);
    expect(afterPatch.budgetData.budgetAmounts).toEqual({});
  });

  it('still round-trips existing budget-data concepts', async () => {
    const categories = [{
      categoryId: 'cat-income',
      name: 'Income',
      type: 'regular',
      displayOrder: 0,
      role: 'income',
      subcategories: [{ subcategoryId: 'sub-pay', name: 'Pay', displayOrder: 0 }],
    }];
    const budgetAmounts = { 'sub-pay': 5000 };
    const budgetFrequencies = { 'sub-pay': 'monthly' };

    const patched = await invoke('PATCH', { categories, budgetAmounts, budgetFrequencies });
    const fetched = await invoke('GET');

    expect(patched.budgetData).toMatchObject({ categories, budgetAmounts, budgetFrequencies });
    expect(fetched.budgetData).toMatchObject({ categories, budgetAmounts, budgetFrequencies });
  });
});
