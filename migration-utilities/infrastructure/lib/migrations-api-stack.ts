import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import { Construct } from 'constructs';

export interface MigrationsApiStackProps extends cdk.StackProps {
  stage: 'dev' | 'prod';
  api: apigateway.RestApi;
  authoriser: apigateway.CognitoUserPoolsAuthorizer;
  /** Pre-built /api resource from PlatformApiStack — migrations mount under /api/migrations/... */
  apiResource: apigateway.Resource;
}

/**
 * MigrationsApiStack — skeleton API namespace for migration utilities.
 *
 * Establishes /api/migrations on the shared platform API Gateway.
 * Routes (e.g. /api/migrations/budget-tracker/transactions/import) are
 * mounted by downstream issues that consume this namespace.
 *
 * Per CONTRIBUTING.md Section 6.4, this stack is a permanent peer to
 * platform infrastructure — not subject to the M7 platform restructuring.
 *
 * First consumer: M6 #176 (budget-migrate Lambda relocation).
 */
export class MigrationsApiStack extends cdk.Stack {
  /** The /api/migrations resource — downstream stacks mount app-specific routes here. */
  public readonly migrationsResource: apigateway.Resource;

  constructor(scope: Construct, id: string, props: MigrationsApiStackProps) {
    super(scope, id, props);

    const { apiResource } = props;

    // Consistent with StockAnalyserApiStack and BudgetTrackerApiStack:
    // addResource() scopes the construct to the parent resource (a
    // PlatformApiStack construct), so the AWS::ApiGateway::Resource
    // for /api/migrations lives in PlatformApiStack's CFN template.
    // Using new apigateway.Resource(this, ...) instead would scope it
    // to MigrationsApiStack, causing a CDK dependency cycle between
    // PlatformApiStack's Deployment and this stack.
    this.migrationsResource = apiResource.addResource('migrations');

    cdk.Tags.of(this).add('app', 'migration-utilities');
    cdk.Tags.of(this).add('environment', props.stage);
  }
}
