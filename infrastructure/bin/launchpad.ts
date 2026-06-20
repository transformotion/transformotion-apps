#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';

import { LaunchpadAuthStack } from '../../apps/launchpad/infrastructure/launchpad-auth-stack';
import { LaunchpadControlPlaneStack } from '../../apps/launchpad/infrastructure/launchpad-control-plane-stack';
import { authDomainConfig } from '../lib/auth-domain-exports';

const app = new cdk.App();

const env = {
  account: '959516291617',
  region: 'ap-southeast-2',
};

new LaunchpadAuthStack(app, 'TransformotionDev-LaunchpadAuth', {
  env,
  stage:       'dev',
  description: 'Transformotion Apps - Dev Launchpad auth domain foundation',
});

const devAuth = authDomainConfig('dev');

new LaunchpadControlPlaneStack(app, 'TransformotionDev-LaunchpadControlPlane', {
  env,
  stage:                    'dev',
  userPoolId:               devAuth.userPoolId,
  userPoolArn:              devAuth.userPoolArn,
  launchpadAppClientId:     devAuth.launchpadAppClientId,
  stockAnalyserAppClientId: devAuth.stockAnalyserAppClientId,
  budgetTrackerAppClientId: devAuth.budgetTrackerAppClientId,
  usersTableName:           devAuth.usersTableName,
  accountsTableName:        devAuth.accountsTableName,
  accountMembersTableName:  devAuth.accountMembersTableName,
  invitationsTableName:     devAuth.invitationsTableName,
  rateLimitsTableName:      devAuth.rateLimitsTableName,
  appAdminGrantsTableName:  devAuth.appAdminGrantsTableName,
  appUrl:                   'https://dev.apps.transformotion.com.au',
  description:              'Transformotion Apps - Dev Launchpad control plane',
});

new LaunchpadAuthStack(app, 'TransformotionProd-LaunchpadAuth', {
  env,
  stage:       'prod',
  description: 'Transformotion Apps - Prod Launchpad auth domain foundation',
});

const prodAuth = authDomainConfig('prod');

new LaunchpadControlPlaneStack(app, 'TransformotionProd-LaunchpadControlPlane', {
  env,
  stage:                    'prod',
  userPoolId:               prodAuth.userPoolId,
  userPoolArn:              prodAuth.userPoolArn,
  launchpadAppClientId:     prodAuth.launchpadAppClientId,
  stockAnalyserAppClientId: prodAuth.stockAnalyserAppClientId,
  budgetTrackerAppClientId: prodAuth.budgetTrackerAppClientId,
  usersTableName:           prodAuth.usersTableName,
  accountsTableName:        prodAuth.accountsTableName,
  accountMembersTableName:  prodAuth.accountMembersTableName,
  invitationsTableName:     prodAuth.invitationsTableName,
  rateLimitsTableName:      prodAuth.rateLimitsTableName,
  appAdminGrantsTableName:  prodAuth.appAdminGrantsTableName,
  appUrl:                   'https://apps.transformotion.com.au',
  description:              'Transformotion Apps - Prod Launchpad control plane',
});
