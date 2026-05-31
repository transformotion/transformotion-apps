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
  description: 'Transformotion Apps - Dev Launchpad control plane',
});

new LaunchpadControlPlaneStack(app, 'TransformotionProd-LaunchpadControlPlane', {
  env,
  stage:       'prod',
  description: 'Transformotion Apps - Prod Launchpad control plane',
});
