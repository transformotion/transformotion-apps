import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as authorizers from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import { Construct } from 'constructs';
import { APPS } from '@transformotion/runtime-config';

export interface PlatformWsStackProps extends cdk.StackProps {
  userPool: cognito.IUserPool;
  stage: 'dev' | 'prod';
}

/**
 * PlatformWsStack — shared WebSocket API Gateway for async AI services.
 *
 * Serves all apps (budget-tracker, stock-analyser, …). The custom Lambda
 * authoriser validates a Cognito ID token from the ?token= query parameter
 * and checks account membership for the app identified by the ?app= parameter.
 *
 * Routes:
 *   $connect    — custom Lambda authoriser validates Cognito ID token
 *   $disconnect — cleans up connection state
 *   $default    — receives client-sent messages (init ping, etc.)
 *
 * DynamoDB table:
 *   platform.ws-connections-{stage}
 *   PK: connectionId
 *   GSI: userId-index (for cleanup queries)
 *   TTL: expiresAt (stale connection cleanup)
 *
 * Outputs:
 *   WssUrl         — wss:// URL for the deployed stage
 *   WsApiEndpoint  — https:// management endpoint for ApiGatewayManagementApi
 */
export class PlatformWsStack extends cdk.Stack {
  public readonly webSocketApi: apigatewayv2.WebSocketApi;
  public readonly webSocketStage: apigatewayv2.WebSocketStage;
  public readonly connectionsTable: dynamodb.Table;
  public readonly wsApiEndpoint: string;

  constructor(scope: Construct, id: string, props: PlatformWsStackProps) {
    super(scope, id, props);

    const { stage, userPool } = props;

    cdk.Tags.of(this).add('app',         'platform');
    cdk.Tags.of(this).add('environment', stage);

    // ── Connection state table ────────────────────────────────────────────────

    this.connectionsTable = new dynamodb.Table(this, 'WsConnectionsTable', {
      tableName:     `platform.ws-connections-${stage}`,
      partitionKey:  { name: 'connectionId', type: dynamodb.AttributeType.STRING },
      billingMode:   dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'expiresAt',
      removalPolicy: stage === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    this.connectionsTable.addGlobalSecondaryIndex({
      indexName:    'userId-index',
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // ── Bundling options shared across all WS Lambdas ─────────────────────────

    const bundling: lambdaNodejs.BundlingOptions = {
      externalModules: ['@aws-sdk/*'],
      minify: true,
      sourceMap: false,
      forceDockerBundling: false,
    };

    const fnDir = path.join(__dirname, '../functions');

    // ── Custom authoriser ─────────────────────────────────────────────────────
    //
    // API Gateway v2 WebSocket does not support CognitoUserPoolsAuthorizer.
    // Reads ?token= (Cognito ID token), ?accountId=, and ?app= from the
    // $connect query string. Validates JWT against Cognito JWKS and checks
    // accounts[app] membership for the requested accountId.

    const authorizerFn = new lambdaNodejs.NodejsFunction(this, 'AuthorizerFn', {
      functionName: `platform-ws-authorizer-${stage}`,
      entry:        path.join(fnDir, 'ws-authorizer/src/index.ts'),
      handler:      'handler',
      runtime:      lambda.Runtime.NODEJS_20_X,
      timeout:      cdk.Duration.seconds(10),
      memorySize:   256,
      environment: {
        COGNITO_USER_POOL_ID: userPool.userPoolId,
        APP_NAME:       'budget-tracker',
        PERMITTED_APPS: APPS.map(app => app.slug).join(','),
      },
      bundling: {
        ...bundling,
        // jose must be bundled — not available in the Lambda runtime
        externalModules: ['@aws-sdk/*'],
      },
    });

    const wsAuthorizer = new authorizers.WebSocketLambdaAuthorizer('WsAuthorizer', authorizerFn, {
      identitySource: ['route.request.querystring.token'],
    });

    // ── $connect Lambda ───────────────────────────────────────────────────────

    const connectFn = new lambdaNodejs.NodejsFunction(this, 'ConnectFn', {
      functionName: `platform-ws-connect-${stage}`,
      entry:        path.join(fnDir, 'ws-connect/src/index.ts'),
      handler:      'handler',
      runtime:      lambda.Runtime.NODEJS_20_X,
      timeout:      cdk.Duration.seconds(10),
      memorySize:   256,
      environment:  { CONNECTIONS_TABLE: this.connectionsTable.tableName },
      bundling,
    });
    this.connectionsTable.grantReadWriteData(connectFn);

    // ── $disconnect Lambda ────────────────────────────────────────────────────

    const disconnectFn = new lambdaNodejs.NodejsFunction(this, 'DisconnectFn', {
      functionName: `platform-ws-disconnect-${stage}`,
      entry:        path.join(fnDir, 'ws-disconnect/src/index.ts'),
      handler:      'handler',
      runtime:      lambda.Runtime.NODEJS_20_X,
      timeout:      cdk.Duration.seconds(10),
      memorySize:   256,
      environment:  { CONNECTIONS_TABLE: this.connectionsTable.tableName },
      bundling,
    });
    this.connectionsTable.grantReadWriteData(disconnectFn);

    // ── $default Lambda ───────────────────────────────────────────────────────

    const defaultFn = new lambdaNodejs.NodejsFunction(this, 'DefaultFn', {
      functionName: `platform-ws-default-${stage}`,
      entry:        path.join(fnDir, 'ws-default/src/index.ts'),
      handler:      'handler',
      runtime:      lambda.Runtime.NODEJS_20_X,
      timeout:      cdk.Duration.seconds(10),
      memorySize:   256,
      bundling,
    });

    // ── WebSocket API + routes ────────────────────────────────────────────────

    this.webSocketApi = new apigatewayv2.WebSocketApi(this, 'PlatformWsApi', {
      apiName: `platform-ws-${stage}`,
      connectRouteOptions: {
        integration: new integrations.WebSocketLambdaIntegration('ConnectInt', connectFn),
        authorizer:  wsAuthorizer,
      },
      disconnectRouteOptions: {
        integration: new integrations.WebSocketLambdaIntegration('DisconnectInt', disconnectFn),
      },
      defaultRouteOptions: {
        integration: new integrations.WebSocketLambdaIntegration('DefaultInt', defaultFn),
      },
    });

    this.webSocketStage = new apigatewayv2.WebSocketStage(this, 'PlatformWsStage', {
      webSocketApi: this.webSocketApi,
      stageName:    stage,
      autoDeploy:   true,
    });

    // Allow $default to push messages back to connected clients
    defaultFn.addToRolePolicy(new iam.PolicyStatement({
      actions:   ['execute-api:ManageConnections'],
      resources: [`arn:aws:execute-api:${this.region}:${this.account}:${this.webSocketApi.apiId}/${stage}/*`],
    }));

    // Management endpoint for ApiGatewayManagementApiClient (https://, not wss://)
    this.wsApiEndpoint = `https://${this.webSocketApi.apiId}.execute-api.${this.region}.amazonaws.com/${stage}`;

    // ── Stack outputs ─────────────────────────────────────────────────────────

    new cdk.CfnOutput(this, 'WssUrl', {
      value:       this.webSocketStage.url,
      description: 'WebSocket URL for platform WS service (consumed by CI to build frontends)',
      exportName:  `PlatformWs-${stage}-Url`,
    });

    new cdk.CfnOutput(this, 'WsApiEndpoint', {
      value:       this.wsApiEndpoint,
      description: 'HTTPS management endpoint for ApiGatewayManagementApi',
      exportName:  `PlatformWs-${stage}-Endpoint`,
    });

    new cdk.CfnOutput(this, 'ConnectionsTableName', {
      value:       this.connectionsTable.tableName,
      description: 'DynamoDB table for WebSocket connection state',
      exportName:  `PlatformWs-${stage}-ConnectionsTableName`,
    });
  }
}
