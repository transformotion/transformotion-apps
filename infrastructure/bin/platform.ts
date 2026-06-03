#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';

import { NetworkStack }           from '../../platform/infrastructure/network-stack';
import { StorageStack }           from '../../platform/infrastructure/storage-stack';
import { GithubActionsRoleStack } from '../../platform/infrastructure/github-actions-role-stack';

const app = new cdk.App();

const env = {
  account: '959516291617',
  region: 'ap-southeast-2',
};

new GithubActionsRoleStack(app, 'Transformotion-GithubActionsRole', {
  env,
  description: 'Transformotion Apps - GitHub Actions deploy IAM roles',
});

new StorageStack(app, 'TransformotionDev-Storage', {
  env,
  stage:       'dev',
  description: 'Transformotion Apps - Dev platform storage (S3 backups bucket)',
});

new NetworkStack(app, 'TransformotionDev-Network', {
  env,
  stage: 'dev',
  description: 'Transformotion Apps - Dev network stack (CloudFront + S3)',
  certificateArn: 'arn:aws:acm:us-east-1:959516291617:certificate/de463b1f-a221-48ec-871e-65b72716d5e9',
  domainNames: ['dev.apps.transformotion.com.au'],
});

new StorageStack(app, 'TransformotionProd-Storage', {
  env,
  stage:       'prod',
  description: 'Transformotion Apps - Prod platform storage (S3 backups bucket)',
});

new NetworkStack(app, 'TransformotionProd-Network', {
  env,
  stage: 'prod',
  description: 'Transformotion Apps - Prod network stack (CloudFront + S3)',
});

const decommissionedPlatformStacks = [
  'Auth',
  'AuthApi',
  'PlatformTables',
  'Api',
  'PlatformWs',
];

for (const stageName of ['Dev', 'Prod']) {
  for (const stackName of decommissionedPlatformStacks) {
    new cdk.Stack(app, `Transformotion${stageName}-${stackName}`, {
      env,
      description: `Transformotion Apps - decommissioned legacy Platform ${stackName} stack placeholder`,
    });
  }
}
