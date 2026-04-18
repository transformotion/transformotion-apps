import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

export interface PlatformTablesStackProps extends cdk.StackProps {
  stage: 'dev' | 'prod';
}

/**
 * PlatformTablesStack — all application DynamoDB tables.
 *
 * Platform tables (multi-tenant core):
 *   platform.users           PK: userId
 *   platform.accounts        PK: accountId
 *   platform.account-members PK: accountId  SK: userId
 *   platform.invitations     PK: invitationId   TTL: expiresAt
 *
 * Stock Analyser tables (app-scoped, keyed by accountId):
 *   stock-analyser.portfolio  PK: accountId
 *   stock-analyser.watchlist  PK: accountId
 *   stock-analyser.cache      PK: accountId  SK: cacheKey   TTL: expiresAt
 *
 * All tables use on-demand (PAY_PER_REQUEST) billing.
 * Dev tables are destroyed on stack deletion; prod tables are retained.
 *
 * Table ARNs are exported so Lambda stacks can grant access without
 * cross-stack references requiring deployment ordering.
 */
export class PlatformTablesStack extends cdk.Stack {
  // ── Platform ──────────────────────────────────────────────────────────────
  public readonly usersTable:          dynamodb.Table;
  public readonly accountsTable:       dynamodb.Table;
  public readonly accountMembersTable: dynamodb.Table;
  public readonly invitationsTable:    dynamodb.Table;

  // ── Stock Analyser ────────────────────────────────────────────────────────
  public readonly portfolioTable:  dynamodb.Table;
  public readonly watchlistTable:  dynamodb.Table;
  public readonly cacheTable:      dynamodb.Table;

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

    // ── stock-analyser.portfolio ──────────────────────────────────────────
    this.portfolioTable = new dynamodb.Table(this, 'PortfolioTable', {
      tableName:     `stock-analyser.portfolio-${stage}`,
      partitionKey:  { name: 'accountId', type: dynamodb.AttributeType.STRING },
      billingMode:   dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: removal,
    });

    // ── stock-analyser.watchlist ──────────────────────────────────────────
    this.watchlistTable = new dynamodb.Table(this, 'WatchlistTable', {
      tableName:     `stock-analyser.watchlist-${stage}`,
      partitionKey:  { name: 'accountId', type: dynamodb.AttributeType.STRING },
      billingMode:   dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: removal,
    });

    // ── stock-analyser.cache ──────────────────────────────────────────────
    // PK: accountId  SK: cacheKey   TTL: expiresAt (epoch seconds)
    this.cacheTable = new dynamodb.Table(this, 'CacheTable', {
      tableName:     `stock-analyser.cache-${stage}`,
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
    out('PortfolioTableArn',      this.portfolioTable,      'stock-analyser.portfolio table ARN');
    out('WatchlistTableArn',      this.watchlistTable,      'stock-analyser.watchlist table ARN');
    out('CacheTableArn',          this.cacheTable,          'stock-analyser.cache table ARN');
  }
}
