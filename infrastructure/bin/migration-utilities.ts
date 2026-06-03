#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';

import { MigrationsApiStack } from '../../migration-utilities/infrastructure/lib/migrations-api-stack';
import { authDomainConfig } from '../lib/auth-domain-exports';

const app = new cdk.App();

const env = {
  account: '959516291617',
  region: 'ap-southeast-2',
};

// ── Dev stacks ─────────────────────────────────────────────────────────────────
// Migration utilities own their API Gateway and import LaunchpadAuth exports for
// JWT authorisation. They do not depend on PlatformApiStack exports.
//
// Deploy commands:
//   cdk deploy --app bin/migration-utilities.ts TransformotionDev-MigrationsApi

const devAuth = authDomainConfig('dev');

new MigrationsApiStack(app, 'TransformotionDev-MigrationsApi', {
  env,
  stage:       'dev',
  userPoolId:  devAuth.userPoolId,
  description: 'Transformotion Apps — Dev Migration Utilities API routes',
});

// ── Prod stacks ────────────────────────────────────────────────────────────────

const prodAuth = authDomainConfig('prod');

new MigrationsApiStack(app, 'TransformotionProd-MigrationsApi', {
  env,
  stage:       'prod',
  userPoolId:  prodAuth.userPoolId,
  description: 'Transformotion Apps — Prod Migration Utilities API routes',
});
