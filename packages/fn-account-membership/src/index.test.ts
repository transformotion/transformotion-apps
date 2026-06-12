import { describe, it, expect, vi } from 'vitest';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { dynamoMembershipLoader } from './index';

const ddbWith = (impl: () => Promise<unknown>): DynamoDBDocumentClient =>
  ({ send: vi.fn(impl) } as unknown as DynamoDBDocumentClient);

describe('dynamoMembershipLoader', () => {
  it('returns { role, status } from the GetItem result', async () => {
    const loader = dynamoMembershipLoader(ddbWith(async () => ({ Item: { role: 'member', status: 'active' } })), 't');
    await expect(loader('acc-1', 'user-1')).resolves.toEqual({ role: 'member', status: 'active' });
  });

  it('returns undefined when the row is absent', async () => {
    const loader = dynamoMembershipLoader(ddbWith(async () => ({})), 't');
    await expect(loader('acc-1', 'user-1')).resolves.toBeUndefined();
  });

  it('issues a scoped GetItem on { accountId, userId } against the given table', async () => {
    const send = vi.fn((_cmd: unknown) => Promise.resolve({ Item: { role: 'owner' } }));
    const ddb = { send } as unknown as DynamoDBDocumentClient;
    await dynamoMembershipLoader(ddb, 'launchpad-account-members-dev')('acc-9', 'u-9');
    const cmd = send.mock.calls[0]![0] as { constructor: { name: string }; input: Record<string, unknown> };
    expect(cmd.constructor.name).toBe('GetCommand');
    expect(cmd.input['TableName']).toBe('launchpad-account-members-dev');
    expect(cmd.input['Key']).toEqual({ accountId: 'acc-9', userId: 'u-9' });
  });

  it('PROPAGATES loader errors (so requireAccountWrite fails closed, never swallows)', async () => {
    const loader = dynamoMembershipLoader(ddbWith(async () => { throw new Error('ProvisionedThroughputExceeded'); }), 't');
    await expect(loader('a', 'u')).rejects.toThrow('ProvisionedThroughputExceeded');
  });
});
