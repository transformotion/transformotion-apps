import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import { Construct } from 'constructs';

export interface LaunchpadControlPlaneStackProps extends cdk.StackProps {
  stage: 'dev' | 'prod';
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

    const { stage } = props;

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
