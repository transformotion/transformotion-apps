import { beforeEach, describe, expect, it, vi } from 'vitest';

const sendMock = vi.hoisted(() => vi.fn());

vi.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: vi.fn(),
}));

vi.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: {
    from: vi.fn(() => ({ send: sendMock })),
  },
  GetCommand: class { constructor(public readonly input: unknown) {} },
  PutCommand: class { constructor(public readonly input: unknown) {} },
  DeleteCommand: class { constructor(public readonly input: unknown) {} },
}));

describe('analysis-cache service-principal SHARED write branch', () => {
  beforeEach(() => {
    vi.resetModules();
    sendMock.mockReset();
    process.env.CACHE_TABLE = 'stock-analyser.analysis-cache-test';
    process.env.JOB_RESULTS_TABLE = 'stock-analyser.job-results-test';
    process.env.ACCOUNT_MEMBERS_TABLE = 'launchpad-account-members-test';
  });

  it('accepts only SHARED-prefix keys and writes to the SHARED partition', async () => {
    sendMock.mockResolvedValueOnce({});
    const { handler } = await import('./index');

    const response = await handler({
      servicePrincipal: 'stock-analyser-notification-engine',
      operation: 'put-shared-cache',
      cacheKey: 'ANALYSIS#CBA.AX',
      data: { verdict: 'BUY' },
      ttlSeconds: 86_400,
      mode: 'live',
      type: 'analysis',
    }, {} as never);

    expect(response).toEqual({ ok: true });
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock.mock.calls[0]?.[0].input).toMatchObject({
      TableName: 'stock-analyser.analysis-cache-test',
      Item: {
        accountId: 'SHARED',
        cacheKey: 'ANALYSIS#CBA.AX',
        data: JSON.stringify({ verdict: 'BUY' }),
        dataType: 'analysis',
        mode: 'live',
      },
    });
  });

  it('rejects account-scoped keys before DynamoDB write', async () => {
    const { handler } = await import('./index');

    await expect(handler({
      servicePrincipal: 'stock-analyser-notification-engine',
      operation: 'put-shared-cache',
      cacheKey: 'PORTFOLIO#acct-1#CBA.AX',
      data: { verdict: 'BUY' },
      ttlSeconds: 86_400,
    }, {} as never)).rejects.toMatchObject({
      statusCode: 400,
    });

    expect(sendMock).not.toHaveBeenCalled();
  });

  it('allows the metals engine to write only the fixed METALS shared cache key', async () => {
    sendMock.mockResolvedValueOnce({});
    const { handler } = await import('./index');

    await handler({
      servicePrincipal: 'stock-analyser-metals',
      operation: 'put-shared-cache',
      cacheKey: 'METALS',
      data: { metals: [] },
      ttlSeconds: 86_400,
      mode: 'live',
      type: 'metals',
    }, {} as never);

    expect(sendMock.mock.calls[0]?.[0].input).toMatchObject({
      Item: {
        accountId: 'SHARED',
        cacheKey: 'METALS',
        data: JSON.stringify({ metals: [] }),
        dataType: 'metals',
        mode: 'live',
      },
    });
  });
});
