import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as path from 'path';
import { Construct } from 'constructs';

export interface LaunchpadControlPlaneStackProps extends cdk.StackProps {
  stage: 'dev' | 'prod';
  userPoolId: string;
  fromEmail: string;
  appUrl: string;
}

/**
 * LaunchpadControlPlaneStack - Launchpad-owned control-plane API foundation.
 *
 * Cognito and shared account data remain platform-owned substrate. Launchpad
 * owns the product/control-plane API surface that will migrate here during #363.
 */
export class LaunchpadControlPlaneStack extends cdk.Stack {
  public readonly api: apigateway.RestApi;

  constructor(scope: Construct, id: string, props: LaunchpadControlPlaneStackProps) {
    super(scope, id, props);

    const { stage, userPoolId, fromEmail, appUrl } = props;

    this.api = new apigateway.RestApi(this, 'LaunchpadControlPlaneApi', {
      restApiName: `launchpad-control-plane-${stage}`,
      description: `Launchpad ${stage} control-plane API`,
      deployOptions: { stageName: stage },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'Authorization', 'X-Account-Id'],
      },
    });

    this.api.root.addResource('health').addMethod(
      'GET',
      new apigateway.MockIntegration({
        integrationResponses: [{ statusCode: '200' }],
        passthroughBehavior: apigateway.PassthroughBehavior.NEVER,
        requestTemplates: { 'application/json': '{"statusCode": 200}' },
      }),
      {
        methodResponses: [{ statusCode: '200' }],
      },
    );

    const rateLimitTable = dynamodb.Table.fromTableName(
      this,
      'LookupProviderRateLimitTable',
      `platform.rate-limits-${stage}`,
    );

    const forgotProviderFn = new lambdaNodejs.NodejsFunction(this, 'ForgotProviderFn', {
      functionName: `launchpad-forgot-provider-${stage}`,
      entry: path.join(__dirname, '../functions/forgot-provider/src/index.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(15),
      memorySize: 256,
      environment: {
        RATE_LIMIT_TABLE: rateLimitTable.tableName,
        USER_POOL_ID: userPoolId,
        FROM_EMAIL: fromEmail,
        APP_URL: appUrl,
      },
      bundling: {
        externalModules: ['@aws-sdk/*'],
        minify: true,
        sourceMap: false,
      },
    });

    rateLimitTable.grantReadWriteData(forgotProviderFn);

    forgotProviderFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['cognito-idp:AdminGetUser'],
      resources: [`arn:aws:cognito-idp:${this.region}:${this.account}:userpool/${userPoolId}`],
    }));

    forgotProviderFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['ses:SendEmail', 'sesv2:SendEmail'],
      resources: ['*'],
    }));

    const auth = this.api.root.addResource('auth');
    auth
      .addResource('lookup-provider')
      .addMethod('POST', new apigateway.LambdaIntegration(forgotProviderFn, { proxy: true }));

    new cdk.CfnOutput(this, 'ControlPlaneApiUrl', {
      value: this.api.url,
      exportName: `Transformotion-${stage}-LaunchpadControlPlaneApiUrl`,
    });

    new cdk.CfnOutput(this, 'ControlPlaneRestApiId', {
      value: this.api.restApiId,
      exportName: `Transformotion-${stage}-LaunchpadControlPlaneRestApiId`,
    });
  }
}
