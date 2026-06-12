import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import type { MembershipLoader, AccountMembershipRow } from '@transformotion/lambda-middleware';

/**
 * Build a {@link MembershipLoader} that reads the caller's membership row from
 * the launchpad-owned `launchpad-account-members-{stage}` table with a single
 * scoped GetItem (key = `{ accountId, userId }`).
 *
 * Used by app-data WRITE handlers (Stock Analyser / Budget Tracker) for the D8
 * write-path row check (`requireAccountWrite`). Errors are deliberately NOT
 * caught here: they propagate to `requireAccountWrite`, which fails closed on a
 * loader throw (deny-by-default — an infra hiccup must never let a write
 * through). The IAM grant on consumers is `dynamodb:GetItem` ONLY.
 */
export function dynamoMembershipLoader(
  ddb: DynamoDBDocumentClient,
  tableName: string,
): MembershipLoader {
  return async (accountId: string, userId: string) => {
    const res = await ddb.send(new GetCommand({
      TableName: tableName,
      Key: { accountId, userId },
      ProjectionExpression: '#r, #s',
      ExpressionAttributeNames: { '#r': 'role', '#s': 'status' },
    }));
    if (!res.Item) return undefined;
    return {
      role: res.Item['role'] as AccountMembershipRow['role'],
      status: res.Item['status'] as string | undefined,
    };
  };
}
