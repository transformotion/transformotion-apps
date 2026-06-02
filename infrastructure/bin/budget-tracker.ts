#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';

import { BudgetTrackerTablesStack } from '../../apps/budget-tracker/infrastructure/budget-tracker-tables-stack';
import { BudgetTrackerApiStack } from '../../apps/budget-tracker/infrastructure/budget-tracker-api-stack';
import { BudgetTrackerWsStack } from '../../apps/budget-tracker/infrastructure/bt-ws-stack';
import { authDomainConfig } from '../lib/auth-domain-exports';

const app = new cdk.App();

const env = {
  account: '959516291617',
  region: 'ap-southeast-2',
};

// Budget Tracker owns its REST API and WSS runtime. Auth-domain ownership
// resolves to LaunchpadAuth through auth-domain-exports.
//
// Deploy commands:
//   cdk deploy --app bin/budget-tracker.ts TransformotionDev-BudgetTrackerTables TransformotionDev-BudgetTrackerWs TransformotionDev-BudgetTrackerApi

const devBudgetTrackerTables = new BudgetTrackerTablesStack(app, 'TransformotionDev-BudgetTrackerTables', {
  env,
  stage:       'dev',
  description: 'Transformotion Apps — Dev Budget Tracker DynamoDB tables',
});

const devAuth = authDomainConfig('dev');

const devBudgetTrackerWs = new BudgetTrackerWsStack(app, 'TransformotionDev-BudgetTrackerWs', {
  env,
  stage:       'dev',
  userPoolId:  devAuth.userPoolId,
  description: 'Transformotion Apps — Dev Budget Tracker WebSocket API',
});

new BudgetTrackerApiStack(app, 'TransformotionDev-BudgetTrackerApi', {
  env,
  stage:                  'dev',
  userPoolId:             devAuth.userPoolId,
  description:            'Transformotion Apps — Dev Budget Tracker API routes',
  budgetDataTableName:    devBudgetTrackerTables.budgetDataTable.tableName,
  aiJobsTableName:        devBudgetTrackerTables.aiJobsTable.tableName,
  wsConnectionsTableName: devBudgetTrackerWs.connectionsTable.tableName,
  wsApiId:                devBudgetTrackerWs.webSocketApi.apiId,
});

const prodBudgetTrackerTables = new BudgetTrackerTablesStack(app, 'TransformotionProd-BudgetTrackerTables', {
  env,
  stage:       'prod',
  description: 'Transformotion Apps — Prod Budget Tracker DynamoDB tables',
});

const prodAuth = authDomainConfig('prod');

const prodBudgetTrackerWs = new BudgetTrackerWsStack(app, 'TransformotionProd-BudgetTrackerWs', {
  env,
  stage:       'prod',
  userPoolId:  prodAuth.userPoolId,
  description: 'Transformotion Apps — Prod Budget Tracker WebSocket API',
});

new BudgetTrackerApiStack(app, 'TransformotionProd-BudgetTrackerApi', {
  env,
  stage:                  'prod',
  userPoolId:             prodAuth.userPoolId,
  description:            'Transformotion Apps — Prod Budget Tracker API routes',
  budgetDataTableName:    prodBudgetTrackerTables.budgetDataTable.tableName,
  aiJobsTableName:        prodBudgetTrackerTables.aiJobsTable.tableName,
  wsConnectionsTableName: prodBudgetTrackerWs.connectionsTable.tableName,
  wsApiId:                prodBudgetTrackerWs.webSocketApi.apiId,
});
