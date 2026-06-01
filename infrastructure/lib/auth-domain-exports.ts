import * as cdk from 'aws-cdk-lib';

export type Stage = 'dev' | 'prod';

export interface AuthDomainConfig {
  cutoverEnabled: boolean;
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
}

export function isLaunchpadAuthCutoverEnabled(): boolean {
  return process.env.LAUNCHPAD_AUTH_CUTOVER_ENABLED === 'true';
}

export function authDomainConfig(stage: Stage): AuthDomainConfig {
  const cutoverEnabled = isLaunchpadAuthCutoverEnabled();

  if (!cutoverEnabled) {
    return {
      cutoverEnabled,
      userPoolId: cdk.Fn.importValue(`Transformotion-${stage}-UserPoolId`),
      userPoolArn: cdk.Fn.importValue(`Transformotion-${stage}-UserPoolArn`),
      launchpadAppClientId: cdk.Fn.importValue(`Transformotion-${stage}-LaunchpadAppClientId`),
      stockAnalyserAppClientId: cdk.Fn.importValue(`Transformotion-${stage}-StockAnalyserAppClientId`),
      budgetTrackerAppClientId: cdk.Fn.importValue(`Transformotion-${stage}-BudgetTrackerAppClientId`),
      usersTableName: `platform.users-${stage}`,
      accountsTableName: `platform.accounts-${stage}`,
      accountMembersTableName: `platform.account-members-${stage}`,
      invitationsTableName: `platform.invitations-${stage}`,
      rateLimitsTableName: `platform.rate-limits-${stage}`,
    };
  }

  return {
    cutoverEnabled,
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
  };
}
