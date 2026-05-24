#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';

import { MigrationsApiStack } from '../../migration-utilities/infrastructure/lib/migrations-api-stack';

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
//   cdk deploy --app bin/migration-utilities.ts TransformotionDev-MigrationsApi

new MigrationsApiStack(app, 'TransformotionDev-MigrationsApi', {
  env,
  stage:       'dev',
  description: 'Transformotion Apps — Dev Migration Utilities API routes',
});

// ── Prod stacks ────────────────────────────────────────────────────────────────

new MigrationsApiStack(app, 'TransformotionProd-MigrationsApi', {
  env,
  stage:       'prod',
  description: 'Transformotion Apps — Prod Migration Utilities API routes',
});
