import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

/**
 * GithubActionsRoleStack — manages inline IAM policies on GitHubActionsDeployRole.
 *
 * The role itself was created out-of-band (see #263 for full CDK migration).
 * This stack takes ownership of the TransformotionDevDeploy inline policy only.
 *
 * Account-level — not stage-specific. Deployed once.
 */
export class GithubActionsRoleStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: cdk.StackProps) {
    super(scope, id, props);

    // CfnRolePolicy maps to PutRolePolicy (upsert) — safe to apply against
    // the existing out-of-band policy; CloudFormation will replace the document.
    new iam.CfnRolePolicy(this, 'TransformotionDeployPolicy', {
      roleName:   'GitHubActionsDeployRole',
      policyName: 'TransformotionDevDeploy',
      policyDocument: {
        Version: '2012-10-17',
        Statement: [
          {
            Effect:   'Allow',
            Action:   ['s3:ListBucket', 's3:GetObject', 's3:PutObject', 's3:DeleteObject'],
            Resource: '*',
          },
          {
            Effect:   'Allow',
            Action:   ['cloudfront:CreateInvalidation', 'cloudfront:GetInvalidation'],
            Resource: '*',
          },
          {
            Effect:   'Allow',
            Action:   'cloudformation:DescribeStacks',
            Resource: `arn:aws:cloudformation:${this.region}:${this.account}:stack/Transformotion*`,
          },
        ],
      },
    });
  }
}
