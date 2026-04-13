#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { NetworkStack }  from '../lib/network-stack';
import { AuthStack }     from '../lib/auth-stack';
import { AuthApiStack }  from '../lib/auth-api-stack';

const app = new cdk.App();

const env = {
  account: '959516291617',
  region: 'ap-southeast-2',
};

// ── Dev stacks ─────────────────────────────────────────────────────────────
new NetworkStack(app, 'TransformotionDev-Network', {
  env,
  stage: 'dev',
  description: 'Transformotion Apps — Dev network stack (CloudFront + S3)',
  // ACM cert issued in S1.7 — must be in us-east-1 for CloudFront
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

// ── Prod stacks ────────────────────────────────────────────────────────────
new NetworkStack(app, 'TransformotionProd-Network', {
  env,
  stage: 'prod',
  description: 'Transformotion Apps — Prod network stack (CloudFront + S3)',
  // Prod cert requested when apps.transformotion.com.au is ready to go live
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
