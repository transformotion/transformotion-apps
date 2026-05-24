#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';

import { NetworkStack }           from '../../platform/infrastructure/network-stack';
import { AuthStack }              from '../../platform/infrastructure/auth-stack';
import { AuthApiStack }           from '../../platform/infrastructure/auth-api-stack';
import { PlatformApiStack }       from '../../platform/infrastructure/platform-api-stack';
import { PlatformTablesStack }    from '../../platform/infrastructure/platform-tables-stack';
import { PlatformWsStack }        from '../../platform/infrastructure/platform-ws-stack';
import { StorageStack }           from '../../platform/infrastructure/storage-stack';
import { GithubActionsRoleStack } from '../../platform/infrastructure/github-actions-role-stack';

const app = new cdk.App();

const env = {
  account: '959516291617',
  region: 'ap-southeast-2',
};

// ── Account-level stacks ───────────────────────────────────────────────────────

new GithubActionsRoleStack(app, 'Transformotion-GithubActionsRole', {
  env,
  description: 'Transformotion Apps — GitHubActionsDeployRole inline IAM policies (#262, #263)',
});

// ── Dev stacks ─────────────────────────────────────────────────────────────────

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

const devPlatformWs = new PlatformWsStack(app, 'TransformotionDev-PlatformWs', {
  env,
  stage:       'dev',
  description: 'Transformotion Apps — Dev platform WebSocket API (AI services)',
  userPool:    devAuth.userPool,
});

new PlatformApiStack(app, 'TransformotionDev-Api', {
  env,
  stage:                    'dev',
  description:              'Transformotion Apps — Dev platform API (shared routes for all apps)',
  userPool:                 devAuth.userPool,
  stockAnalyserAppClientId:   devAuth.stockAnalyserAppClient.userPoolClientId,
  budgetTrackerAppClientId: devAuth.budgetTrackerAppClient.userPoolClientId,
  jobResultsTableName:      'platform.job-results-dev',
  wsApiEndpoint:            devPlatformWs.wsApiEndpoint,
  wsApiId:                  devPlatformWs.webSocketApi.apiId,
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

const prodPlatformWs = new PlatformWsStack(app, 'TransformotionProd-PlatformWs', {
  env,
  stage:       'prod',
  description: 'Transformotion Apps — Prod platform WebSocket API (AI services)',
  userPool:    prodAuth.userPool,
});

new PlatformApiStack(app, 'TransformotionProd-Api', {
  env,
  stage:                    'prod',
  description:              'Transformotion Apps — Prod platform API (shared routes for all apps)',
  userPool:                 prodAuth.userPool,
  stockAnalyserAppClientId:   prodAuth.stockAnalyserAppClient.userPoolClientId,
  budgetTrackerAppClientId: prodAuth.budgetTrackerAppClient.userPoolClientId,
  jobResultsTableName:      'platform.job-results-prod',
  wsApiEndpoint:            prodPlatformWs.wsApiEndpoint,
  wsApiId:                  prodPlatformWs.webSocketApi.apiId,
});
