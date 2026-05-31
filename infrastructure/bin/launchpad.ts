#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';

import { LaunchpadControlPlaneStack } from '../../apps/launchpad/infrastructure/launchpad-control-plane-stack';

const app = new cdk.App();

const env = {
  account: '959516291617',
  region: 'ap-southeast-2',
};

new LaunchpadControlPlaneStack(app, 'TransformotionDev-LaunchpadControlPlane', {
  env,
  stage:       'dev',
  userPoolId:  cdk.Fn.importValue('Transformotion-dev-UserPoolId'),
  fromEmail:   'noreply@transformotion.com.au',
  appUrl:      'https://dev.apps.transformotion.com.au',
  description: 'Transformotion Apps - Dev Launchpad control plane',
});

new LaunchpadControlPlaneStack(app, 'TransformotionProd-LaunchpadControlPlane', {
  env,
  stage:       'prod',
  userPoolId:  cdk.Fn.importValue('Transformotion-prod-UserPoolId'),
  fromEmail:   'noreply@transformotion.com.au',
  appUrl:      'https://apps.transformotion.com.au',
  description: 'Transformotion Apps - Prod Launchpad control plane',
});
