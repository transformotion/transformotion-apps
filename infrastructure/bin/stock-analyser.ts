#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';

import { StockAnalyserTablesStack } from '../../apps/stock-analyser/infrastructure/stock-analyser-tables-stack';
import { StockAnalyserApiStack }    from '../../apps/stock-analyser/infrastructure/stock-analyser-api-stack';
import { StockAnalyserWsStack }     from '../../apps/stock-analyser/infrastructure/sa-ws-stack';

const app = new cdk.App();

const env = {
  account: '959516291617',
  region: 'ap-southeast-2',
};

// Stock Analyser owns REST, WSS, AI runtime, and app data after #366.
// Cognito remains platform-owned until #363 and is imported by User Pool ID.
//
// Deploy commands:
//   cdk deploy --app bin/stock-analyser.ts TransformotionDev-StockAnalyserTables TransformotionDev-StockAnalyserWs TransformotionDev-StockAnalyserApi

const devStockAnalyserTables = new StockAnalyserTablesStack(app, 'TransformotionDev-StockAnalyserTables', {
  env,
  stage:       'dev',
  description: 'Transformotion Apps - Dev Stock Analyser DynamoDB tables',
});

const devStockAnalyserWs = new StockAnalyserWsStack(app, 'TransformotionDev-StockAnalyserWs', {
  env,
  stage:       'dev',
  userPoolId:  cdk.Fn.importValue('Transformotion-dev-UserPoolId'),
  description: 'Transformotion Apps - Dev Stock Analyser WebSocket API',
});

new StockAnalyserApiStack(app, 'TransformotionDev-StockAnalyserApi', {
  env,
  stage:              'dev',
  userPoolId:         cdk.Fn.importValue('Transformotion-dev-UserPoolId'),
  portfolioTable:     devStockAnalyserTables.portfolioTableNew,
  watchlistTable:     devStockAnalyserTables.watchlistTableNew,
  analysisCacheTable: devStockAnalyserTables.analysisCacheTable,
  jobResultsTable:    devStockAnalyserTables.jobResultsTable,
  wsApiEndpoint:      devStockAnalyserWs.wsApiEndpoint,
  wsApiId:            devStockAnalyserWs.webSocketApi.apiId,
  description:        'Transformotion Apps - Dev Stock Analyser API routes',
});

const prodStockAnalyserTables = new StockAnalyserTablesStack(app, 'TransformotionProd-StockAnalyserTables', {
  env,
  stage:       'prod',
  description: 'Transformotion Apps - Prod Stock Analyser DynamoDB tables',
});

const prodStockAnalyserWs = new StockAnalyserWsStack(app, 'TransformotionProd-StockAnalyserWs', {
  env,
  stage:       'prod',
  userPoolId:  cdk.Fn.importValue('Transformotion-prod-UserPoolId'),
  description: 'Transformotion Apps - Prod Stock Analyser WebSocket API',
});

new StockAnalyserApiStack(app, 'TransformotionProd-StockAnalyserApi', {
  env,
  stage:              'prod',
  userPoolId:         cdk.Fn.importValue('Transformotion-prod-UserPoolId'),
  portfolioTable:     prodStockAnalyserTables.portfolioTableNew,
  watchlistTable:     prodStockAnalyserTables.watchlistTableNew,
  analysisCacheTable: prodStockAnalyserTables.analysisCacheTable,
  jobResultsTable:    prodStockAnalyserTables.jobResultsTable,
  wsApiEndpoint:      prodStockAnalyserWs.wsApiEndpoint,
  wsApiId:            prodStockAnalyserWs.webSocketApi.apiId,
  description:        'Transformotion Apps - Prod Stock Analyser API routes',
});
