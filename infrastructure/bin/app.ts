#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';

// ── Platform stacks ───────────────────────────────────────────────────────────
import { NetworkStack }           from '../../platform/infrastructure/network-stack';
import { AuthStack }              from '../../platform/infrastructure/auth-stack';
import { AuthApiStack }           from '../../platform/infrastructure/auth-api-stack';
import { PlatformApiStack }       from '../../platform/infrastructure/platform-api-stack';
import { PlatformTablesStack }    from '../../platform/infrastructure/platform-tables-stack';
import { StorageStack }           from '../../platform/infrastructure/storage-stack';
import { GithubActionsRoleStack } from '../../platform/infrastructure/github-actions-role-stack';

// ── Stock Analyser stacks ─────────────────────────────────────────────────────
import { StockAnalyserApiStack }    from '../../apps/stock-analyser/infrastructure/stock-analyser-api-stack';
import { StockAnalyserTablesStack } from '../../apps/stock-analyser/infrastructure/stock-analyser-tables-stack';

// ── Budget Tracker stacks ─────────────────────────────────────────────────────
import { BudgetTrackerTablesStack } from '../../apps/budget-tracker/infrastructure/budget-tracker-tables-stack';
import { BudgetTrackerApiStack }    from '../../apps/budget-tracker/infrastructure/budget-tracker-api-stack';
import { BudgetTrackerWsStack }     from '../../apps/budget-tracker/infrastructure/budget-tracker-ws-stack';

// ── Migration Utilities stacks ────────────────────────────────────────────────
import { MigrationsApiStack } from '../../migration-utilities/infrastructure/lib/migrations-api-stack';

const app = new cdk.App();

const env = {
  account: '959516291617',
  region: 'ap-southeast-2',
};

// ── Account-level stacks (not stage-specific) ─────────────────────────────────

new GithubActionsRoleStack(app, 'Transformotion-GithubActionsRole', {
  env,
  description: 'Transformotion Apps — GitHubActionsDeployRole inline IAM policies (#262, #263)',
});

// ── Dev stacks ────────────────────────────────────────────────────────────────

new StorageStack(app, 'TransformotionDev-Storage', {
  env,
  stage:       'dev',
  description: 'Transformotion Apps — Dev platform storage (S3 backups bucket)',
});

new NetworkStack(app, 'TransformotionDev-Network', {
  env,
  stage: 'dev',
  description: 'Transformotion Apps — Dev network stack (CloudFront + S3)',
  certificateArn: 'arn:aws:acm:us-east-1:959516291617:certificate/de463b1f-a221-48ec-871e-65b72716d5e9',
  domainNames: ['dev.apps.transformotion.com.au'],
});

const devAuth = new AuthStack(app, 'TransformotionDev-Auth', {
  env,
  stage: 'dev',
  description: 'Transformotion Apps — Dev auth stack (Cognito User Pool)',
});

new AuthApiStack(app, 'TransformotionDev-AuthApi', {
  env,
  stage:       'dev',
  description: 'Transformotion Apps — Dev auth API (forgot-provider Lambda + API Gateway)',
  userPoolId:  devAuth.userPool.userPoolId,
  fromEmail:   'noreply@transformotion.com.au',
  appUrl:      'https://dev.apps.transformotion.com.au',
});

new PlatformTablesStack(app, 'TransformotionDev-PlatformTables', {
  env,
  stage:       'dev',
  description: 'Transformotion Apps — Dev platform DynamoDB tables (users, accounts, invitations)',
});

const devStockAnalyserTables = new StockAnalyserTablesStack(app, 'TransformotionDev-StockAnalyserTables', {
  env,
  stage:       'dev',
  description: 'Transformotion Apps — Dev Stock Analyser DynamoDB tables',
});

const devPlatformApi = new PlatformApiStack(app, 'TransformotionDev-Api', {
  env,
  stage:                    'dev',
  description:              'Transformotion Apps — Dev platform API (shared routes for all apps)',
  userPool:                 devAuth.userPool,
  stockSignalAppClientId:   devAuth.stockAnalyserAppClient.userPoolClientId,
  budgetTrackerAppClientId: devAuth.budgetTrackerAppClient.userPoolClientId,
  analysisCacheTable:       devStockAnalyserTables.analysisCacheTable,
});

new StockAnalyserApiStack(app, 'TransformotionDev-StockAnalyserApi', {
  env,
  stage:       'dev',
  description: 'Transformotion Apps — Dev Stock Analyser API routes',
  api:         devPlatformApi.api,
  authoriser:  devPlatformApi.authoriser,
});

const devBudgetTrackerTables = new BudgetTrackerTablesStack(app, 'TransformotionDev-BudgetTrackerTables', {
  env,
  stage:       'dev',
  description: 'Transformotion Apps — Dev Budget Tracker DynamoDB tables',
});

const devBudgetTrackerWs = new BudgetTrackerWsStack(app, 'TransformotionDev-BudgetTrackerWs', {
  env,
  stage:       'dev',
  description: 'Transformotion Apps — Dev Budget Tracker WebSocket API (AI Review)',
  userPool:    devAuth.userPool,
});

new BudgetTrackerApiStack(app, 'TransformotionDev-BudgetTrackerApi', {
  env,
  stage:                  'dev',
  description:            'Transformotion Apps — Dev Budget Tracker API routes',
  api:                    devPlatformApi.api,
  authoriser:             devPlatformApi.authoriser,
  apiResource:            devPlatformApi.apiResource,
  budgetDataTableName:    devBudgetTrackerTables.budgetDataTable.tableName,
  aiJobsTableName:        devBudgetTrackerTables.aiJobsTable.tableName,
  wsConnectionsTableName: devBudgetTrackerWs.connectionsTable.tableName,
  wsApiId:                devBudgetTrackerWs.webSocketApi.apiId,
});

new MigrationsApiStack(app, 'TransformotionDev-MigrationsApi', {
  env,
  stage:       'dev',
  description: 'Transformotion Apps — Dev Migration Utilities API routes',
  api:         devPlatformApi.api,
  authoriser:  devPlatformApi.authoriser,
  apiResource: devPlatformApi.apiResource,
});

// ── Prod stacks ────────────────────────────────────────────────────────────────

new StorageStack(app, 'TransformotionProd-Storage', {
  env,
  stage:       'prod',
  description: 'Transformotion Apps — Prod platform storage (S3 backups bucket)',
});

new NetworkStack(app, 'TransformotionProd-Network', {
  env,
  stage: 'prod',
  description: 'Transformotion Apps — Prod network stack (CloudFront + S3)',
});

const prodAuth = new AuthStack(app, 'TransformotionProd-Auth', {
  env,
  stage: 'prod',
  description: 'Transformotion Apps — Prod auth stack (Cognito User Pool)',
});

new AuthApiStack(app, 'TransformotionProd-AuthApi', {
  env,
  stage:       'prod',
  description: 'Transformotion Apps — Prod auth API (forgot-provider Lambda + API Gateway)',
  userPoolId:  prodAuth.userPool.userPoolId,
  fromEmail:   'noreply@transformotion.com.au',
  appUrl:      'https://apps.transformotion.com.au',
});

new PlatformTablesStack(app, 'TransformotionProd-PlatformTables', {
  env,
  stage:       'prod',
  description: 'Transformotion Apps — Prod platform DynamoDB tables (users, accounts, invitations)',
});

const prodStockAnalyserTables = new StockAnalyserTablesStack(app, 'TransformotionProd-StockAnalyserTables', {
  env,
  stage:       'prod',
  description: 'Transformotion Apps — Prod Stock Analyser DynamoDB tables',
});

const prodPlatformApi = new PlatformApiStack(app, 'TransformotionProd-Api', {
  env,
  stage:                    'prod',
  description:              'Transformotion Apps — Prod platform API (shared routes for all apps)',
  userPool:                 prodAuth.userPool,
  stockSignalAppClientId:   prodAuth.stockAnalyserAppClient.userPoolClientId,
  budgetTrackerAppClientId: prodAuth.budgetTrackerAppClient.userPoolClientId,
  analysisCacheTable:       prodStockAnalyserTables.analysisCacheTable,
});

new StockAnalyserApiStack(app, 'TransformotionProd-StockAnalyserApi', {
  env,
  stage:       'prod',
  description: 'Transformotion Apps — Prod Stock Analyser API routes',
  api:         prodPlatformApi.api,
  authoriser:  prodPlatformApi.authoriser,
});

const prodBudgetTrackerTables = new BudgetTrackerTablesStack(app, 'TransformotionProd-BudgetTrackerTables', {
  env,
  stage:       'prod',
  description: 'Transformotion Apps — Prod Budget Tracker DynamoDB tables',
});

const prodBudgetTrackerWs = new BudgetTrackerWsStack(app, 'TransformotionProd-BudgetTrackerWs', {
  env,
  stage:       'prod',
  description: 'Transformotion Apps — Prod Budget Tracker WebSocket API (AI Review)',
  userPool:    prodAuth.userPool,
});

new BudgetTrackerApiStack(app, 'TransformotionProd-BudgetTrackerApi', {
  env,
  stage:                  'prod',
  description:            'Transformotion Apps — Prod Budget Tracker API routes',
  api:                    prodPlatformApi.api,
  authoriser:             prodPlatformApi.authoriser,
  apiResource:            prodPlatformApi.apiResource,
  budgetDataTableName:    prodBudgetTrackerTables.budgetDataTable.tableName,
  aiJobsTableName:        prodBudgetTrackerTables.aiJobsTable.tableName,
  wsConnectionsTableName: prodBudgetTrackerWs.connectionsTable.tableName,
  wsApiId:                prodBudgetTrackerWs.webSocketApi.apiId,
});

new MigrationsApiStack(app, 'TransformotionProd-MigrationsApi', {
  env,
  stage:       'prod',
  description: 'Transformotion Apps — Prod Migration Utilities API routes',
  api:         prodPlatformApi.api,
  authoriser:  prodPlatformApi.authoriser,
  apiResource: prodPlatformApi.apiResource,
});
