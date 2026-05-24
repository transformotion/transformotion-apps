#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';

import { BudgetTrackerTablesStack } from '../../apps/budget-tracker/infrastructure/budget-tracker-tables-stack';
import { BudgetTrackerApiStack }    from '../../apps/budget-tracker/infrastructure/budget-tracker-api-stack';

const app = new cdk.App();

const env = {
  account: '959516291617',
  region: 'ap-southeast-2',
};

// ── Dev stacks ─────────────────────────────────────────────────────────────────
// Platform resources (RestApi, Authoriser, /api resource, WsApiId) are imported via
// CloudFormation exports from TransformotionDev-Api and TransformotionDev-PlatformWs.
//
// Deploy commands:
//   cdk deploy --app bin/budget-tracker.ts TransformotionDev-BudgetTrackerTables TransformotionDev-BudgetTrackerApi

const devBudgetTrackerTables = new BudgetTrackerTablesStack(app, 'TransformotionDev-BudgetTrackerTables', {
  env,
  stage:       'dev',
  description: 'Transformotion Apps — Dev Budget Tracker DynamoDB tables',
});

new BudgetTrackerApiStack(app, 'TransformotionDev-BudgetTrackerApi', {
  env,
  stage:                  'dev',
  description:            'Transformotion Apps — Dev Budget Tracker API routes',
  budgetDataTableName:    devBudgetTrackerTables.budgetDataTable.tableName,
  aiJobsTableName:        devBudgetTrackerTables.aiJobsTable.tableName,
  wsConnectionsTableName: `platform.ws-connections-dev`,
  wsApiId:                cdk.Fn.importValue('PlatformWs-dev-WsApiId'),
});

// ── Prod stacks ────────────────────────────────────────────────────────────────

const prodBudgetTrackerTables = new BudgetTrackerTablesStack(app, 'TransformotionProd-BudgetTrackerTables', {
  env,
  stage:       'prod',
  description: 'Transformotion Apps — Prod Budget Tracker DynamoDB tables',
});

new BudgetTrackerApiStack(app, 'TransformotionProd-BudgetTrackerApi', {
  env,
  stage:                  'prod',
  description:            'Transformotion Apps — Prod Budget Tracker API routes',
  budgetDataTableName:    prodBudgetTrackerTables.budgetDataTable.tableName,
  aiJobsTableName:        prodBudgetTrackerTables.aiJobsTable.tableName,
  wsConnectionsTableName: `platform.ws-connections-prod`,
  wsApiId:                cdk.Fn.importValue('PlatformWs-prod-WsApiId'),
});
