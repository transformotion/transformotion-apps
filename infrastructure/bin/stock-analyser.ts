#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';

import { StockAnalyserTablesStack } from '../../apps/stock-analyser/infrastructure/stock-analyser-tables-stack';
import { StockAnalyserApiStack }    from '../../apps/stock-analyser/infrastructure/stock-analyser-api-stack';

const app = new cdk.App();

const env = {
  account: '959516291617',
  region: 'ap-southeast-2',
};

// ── Dev stacks ─────────────────────────────────────────────────────────────────
// Platform resources (RestApi, Authoriser, /api resource) are imported via
// CloudFormation exports from TransformotionDev-Api at deploy time.
//
// Deploy commands:
//   cdk deploy --app bin/stock-analyser.ts TransformotionDev-StockAnalyserTables TransformotionDev-StockAnalyserApi

new StockAnalyserTablesStack(app, 'TransformotionDev-StockAnalyserTables', {
  env,
  stage:       'dev',
  description: 'Transformotion Apps — Dev Stock Analyser DynamoDB tables',
});

new StockAnalyserApiStack(app, 'TransformotionDev-StockAnalyserApi', {
  env,
  stage:               'dev',
  description:         'Transformotion Apps — Dev Stock Analyser API routes',
  jobResultsTableName: 'platform.job-results-dev',
});

// ── Prod stacks ────────────────────────────────────────────────────────────────

new StockAnalyserTablesStack(app, 'TransformotionProd-StockAnalyserTables', {
  env,
  stage:       'prod',
  description: 'Transformotion Apps — Prod Stock Analyser DynamoDB tables',
});

new StockAnalyserApiStack(app, 'TransformotionProd-StockAnalyserApi', {
  env,
  stage:               'prod',
  description:         'Transformotion Apps — Prod Stock Analyser API routes',
  jobResultsTableName: 'platform.job-results-prod',
});
