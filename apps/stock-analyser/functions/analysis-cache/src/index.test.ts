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

// #637 FEED-HISTORY BOUNDARY GUARD. The metals engine's METALS_CLOSES#/METALS_BASELINE# rows are
// engine-internal, direct-write BY DESIGN (docs/adr-service-principal-background-jobs.md —
// "feed-history direct-write"). They MUST stay OUT of SHARED_PREFIXES. This block goes RED if
// someone adds them to the allowlist (or drops a tab-read prefix from it) — converting the latent
// ETFS-shape silent-rejection gap from "waiting to fire" to "structurally cannot fire unsanctioned".
describe('#637 feed-history direct-write boundary', () => {
  it('rejects the metals feed-history prefixes from the service-principal (SHARED) path', async () => {
    const { isSharedServiceCacheKey } = await import('./index');
    expect(isSharedServiceCacheKey('METALS_CLOSES#2026-07-02')).toBe(false);
    expect(isSharedServiceCacheKey('METALS_BASELINE#2026')).toBe(false);
  });

  it('keeps the tab-read shared-result prefixes ON the service-principal path', async () => {
    const { isSharedServiceCacheKey } = await import('./index');
    for (const key of ['METALS', 'MARKET#australia', 'ETF#ASX', 'RECS#Dow|Top Picks', 'ANALYSIS#BHP.AX']) {
      expect(isSharedServiceCacheKey(key)).toBe(true);
    }
  });
});
