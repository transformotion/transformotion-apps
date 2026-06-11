import * as cdk from 'aws-cdk-lib';

export type Stage = 'dev' | 'prod';

export interface AuthDomainConfig {
  userPoolId: string;
  userPoolArn: string;
  launchpadAppClientId: string;
  stockAnalyserAppClientId: string;
  budgetTrackerAppClientId: string;
  usersTableName: string;
  accountsTableName: string;
  accountMembersTableName: string;
  invitationsTableName: string;
  rateLimitsTableName: string;
  appAdminGrantsTableName: string;
}

export function authDomainConfig(stage: Stage): AuthDomainConfig {
  return {
    userPoolId: cdk.Fn.importValue(`Transformotion-${stage}-LaunchpadAuth-UserPoolId`),
    userPoolArn: cdk.Fn.importValue(`Transformotion-${stage}-LaunchpadAuth-UserPoolArn`),
    launchpadAppClientId: cdk.Fn.importValue(`Transformotion-${stage}-LaunchpadAuth-LaunchpadAppClientId`),
    stockAnalyserAppClientId: cdk.Fn.importValue(`Transformotion-${stage}-LaunchpadAuth-StockAnalyserAppClientId`),
    budgetTrackerAppClientId: cdk.Fn.importValue(`Transformotion-${stage}-LaunchpadAuth-BudgetTrackerAppClientId`),
    usersTableName: cdk.Fn.importValue(`Transformotion-${stage}-LaunchpadAuth-UsersTableName`),
    accountsTableName: cdk.Fn.importValue(`Transformotion-${stage}-LaunchpadAuth-AccountsTableName`),
    accountMembersTableName: cdk.Fn.importValue(`Transformotion-${stage}-LaunchpadAuth-AccountMembersTableName`),
    invitationsTableName: cdk.Fn.importValue(`Transformotion-${stage}-LaunchpadAuth-InvitationsTableName`),
    rateLimitsTableName: cdk.Fn.importValue(`Transformotion-${stage}-LaunchpadAuth-RateLimitsTableName`),
    appAdminGrantsTableName: cdk.Fn.importValue(`Transformotion-${stage}-LaunchpadAuth-AppAdminGrantsTableName`),
  };
}
