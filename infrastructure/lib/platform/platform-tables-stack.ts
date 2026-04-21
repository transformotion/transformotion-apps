import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

export interface PlatformTablesStackProps extends cdk.StackProps {
  stage: 'dev' | 'prod';
}

/**
 * PlatformTablesStack — DynamoDB tables shared across all apps.
 *
 * Tables:
 *   platform.users           PK: userId
 *   platform.accounts        PK: accountId
 *   platform.account-members PK: accountId  SK: userId
 *   platform.invitations     PK: invitationId   TTL: expiresAt
 *   platform.analysis-cache  PK: accountId  SK: cacheKey   TTL: expiresAt
 *     (used by the shared claude-proxy Lambda — all apps share one cache)
 *
 * Per-app tables live in their own app stacks (see apps/<app>/infrastructure/).
 */
export class PlatformTablesStack extends cdk.Stack {
  public readonly usersTable:          dynamodb.Table;
  public readonly accountsTable:       dynamodb.Table;
  public readonly accountMembersTable: dynamodb.Table;
  public readonly invitationsTable:    dynamodb.Table;
  public readonly analysisCacheTable:  dynamodb.Table;

  constructor(scope: Construct, id: string, props: PlatformTablesStackProps) {
    super(scope, id, props);

    const { stage } = props;
    const isProd = stage === 'prod';
    const removal = isProd ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY;

    // ── platform.users ────────────────────────────────────────────────────
    this.usersTable = new dynamodb.Table(this, 'UsersTable', {
      tableName:     `platform.users-${stage}`,
      partitionKey:  { name: 'userId', type: dynamodb.AttributeType.STRING },
      billingMode:   dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: removal,
    });

    // ── platform.accounts ─────────────────────────────────────────────────
    this.accountsTable = new dynamodb.Table(this, 'AccountsTable', {
      tableName:     `platform.accounts-${stage}`,
      partitionKey:  { name: 'accountId', type: dynamodb.AttributeType.STRING },
      billingMode:   dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: removal,
    });

    // ── platform.account-members ──────────────────────────────────────────
    // PK: accountId  SK: userId
    // GSI: userId-index (PK: userId) — look up all accounts a user belongs to
    this.accountMembersTable = new dynamodb.Table(this, 'AccountMembersTable', {
      tableName:     `platform.account-members-${stage}`,
      partitionKey:  { name: 'accountId', type: dynamodb.AttributeType.STRING },
      sortKey:       { name: 'userId',    type: dynamodb.AttributeType.STRING },
      billingMode:   dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: removal,
    });

    this.accountMembersTable.addGlobalSecondaryIndex({
      indexName:    'userId-index',
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // ── platform.invitations ──────────────────────────────────────────────
    // PK: invitationId   TTL: expiresAt (epoch seconds)
    // GSI: email-index (PK: email) — look up pending invites for a new user
    this.invitationsTable = new dynamodb.Table(this, 'InvitationsTable', {
      tableName:     `platform.invitations-${stage}`,
      partitionKey:  { name: 'invitationId', type: dynamodb.AttributeType.STRING },
      billingMode:   dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'expiresAt',
      removalPolicy: removal,
    });

    this.invitationsTable.addGlobalSecondaryIndex({
      indexName:    'email-index',
      partitionKey: { name: 'email', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // ── platform.analysis-cache ───────────────────────────────────────────
    // Shared by the claude-proxy Lambda across all apps.
    // PK: accountId  SK: cacheKey   TTL: expiresAt (epoch seconds)
    this.analysisCacheTable = new dynamodb.Table(this, 'AnalysisCacheTable', {
      tableName:     `platform.analysis-cache-${stage}`,
      partitionKey:  { name: 'accountId', type: dynamodb.AttributeType.STRING },
      sortKey:       { name: 'cacheKey',  type: dynamodb.AttributeType.STRING },
      billingMode:   dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'expiresAt',
      removalPolicy: removal,
    });

    // ── Outputs ───────────────────────────────────────────────────────────
    const out = (id: string, table: dynamodb.Table, hint: string) => {
      new cdk.CfnOutput(this, id, {
        value:       table.tableArn,
        description: hint,
        exportName:  `Transformotion-${stage}-${id}`,
      });
    };

    out('UsersTableArn',          this.usersTable,          'platform.users table ARN');
    out('AccountsTableArn',       this.accountsTable,       'platform.accounts table ARN');
    out('AccountMembersTableArn', this.accountMembersTable, 'platform.account-members table ARN');
    out('InvitationsTableArn',    this.invitationsTable,    'platform.invitations table ARN');
    out('AnalysisCacheTableArn',  this.analysisCacheTable,  'platform.analysis-cache table ARN');
  }
}
