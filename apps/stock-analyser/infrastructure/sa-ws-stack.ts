import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as authorizers from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import * as integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import { Construct } from 'constructs';

export interface StockAnalyserWsStackProps extends cdk.StackProps {
  stage: 'dev' | 'prod';
  userPoolId: string;
}

/**
 * StockAnalyserWsStack - Stock Analyser-owned WebSocket runtime.
 *
 * The Stock Analyser AI runtime sends job_complete notifications through this
 * app-owned WSS endpoint.
 */
export class StockAnalyserWsStack extends cdk.Stack {
  public readonly webSocketApi: apigatewayv2.WebSocketApi;
  public readonly webSocketStage: apigatewayv2.WebSocketStage;
  public readonly connectionsTable: dynamodb.Table;
  public readonly wsApiEndpoint: string;

  constructor(scope: Construct, id: string, props: StockAnalyserWsStackProps) {
    super(scope, id, props);

    const { stage, userPoolId } = props;

    cdk.Tags.of(this).add('app', 'stock-analyser');
    cdk.Tags.of(this).add('environment', stage);

    this.connectionsTable = new dynamodb.Table(this, 'WsConnectionsTable', {
      tableName:           `stock-analyser.ws-connections-${stage}`,
      partitionKey:        { name: 'connectionId', type: dynamodb.AttributeType.STRING },
      billingMode:         dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'expiresAt',
      removalPolicy:       stage === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    this.connectionsTable.addGlobalSecondaryIndex({
      indexName:      'userId-index',
      partitionKey:   { name: 'userId', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    const bundling: lambdaNodejs.BundlingOptions = {
      externalModules: ['@aws-sdk/*'],
      minify: true,
      sourceMap: false,
      forceDockerBundling: false,
    };

    const fnDir = path.join(__dirname, '../functions');

    const authorizerFn = new lambdaNodejs.NodejsFunction(this, 'AuthorizerFn', {
      functionName: `stock-analyser-ws-authorizer-${stage}`,
      entry:        path.join(fnDir, 'ws-authorizer/src/index.ts'),
      handler:      'handler',
      runtime:      lambda.Runtime.NODEJS_20_X,
      timeout:      cdk.Duration.seconds(10),
      memorySize:   256,
      environment: {
        COGNITO_USER_POOL_ID: userPoolId,
        APP_NAME:             'stock-analyser',
      },
      bundling,
    });

    const wsAuthorizer = new authorizers.WebSocketLambdaAuthorizer('WsAuthorizer', authorizerFn, {
      identitySource: ['route.request.querystring.token'],
    });

    const connectFn = new lambdaNodejs.NodejsFunction(this, 'ConnectFn', {
      functionName: `stock-analyser-ws-connect-${stage}`,
      entry:        path.join(fnDir, 'ws-connect/src/index.ts'),
      handler:      'handler',
      runtime:      lambda.Runtime.NODEJS_20_X,
      timeout:      cdk.Duration.seconds(10),
      memorySize:   256,
      environment:  { CONNECTIONS_TABLE: this.connectionsTable.tableName },
      bundling,
    });
    this.connectionsTable.grantReadWriteData(connectFn);

    const disconnectFn = new lambdaNodejs.NodejsFunction(this, 'DisconnectFn', {
      functionName: `stock-analyser-ws-disconnect-${stage}`,
      entry:        path.join(fnDir, 'ws-disconnect/src/index.ts'),
      handler:      'handler',
      runtime:      lambda.Runtime.NODEJS_20_X,
      timeout:      cdk.Duration.seconds(10),
      memorySize:   256,
      environment:  { CONNECTIONS_TABLE: this.connectionsTable.tableName },
      bundling,
    });
    this.connectionsTable.grantReadWriteData(disconnectFn);

    const defaultFn = new lambdaNodejs.NodejsFunction(this, 'DefaultFn', {
      functionName: `stock-analyser-ws-default-${stage}`,
      entry:        path.join(fnDir, 'ws-default/src/index.ts'),
      handler:      'handler',
      runtime:      lambda.Runtime.NODEJS_20_X,
      timeout:      cdk.Duration.seconds(10),
      memorySize:   256,
      bundling,
    });

    this.webSocketApi = new apigatewayv2.WebSocketApi(this, 'StockAnalyserWsApi', {
      apiName: `stock-analyser-ws-${stage}`,
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

    this.webSocketStage = new apigatewayv2.WebSocketStage(this, 'StockAnalyserWsStage', {
      webSocketApi: this.webSocketApi,
      stageName:    stage,
      autoDeploy:   true,
    });

    defaultFn.addToRolePolicy(new iam.PolicyStatement({
      actions:   ['execute-api:ManageConnections'],
      resources: [`arn:aws:execute-api:${this.region}:${this.account}:${this.webSocketApi.apiId}/${stage}/*`],
    }));

    this.wsApiEndpoint = `https://${this.webSocketApi.apiId}.execute-api.${this.region}.amazonaws.com/${stage}`;

    new cdk.CfnOutput(this, 'WssUrl', {
      value:       this.webSocketStage.url,
      description: 'WebSocket URL for Stock Analyser WSS service',
      exportName:  `StockAnalyserWs-${stage}-Url`,
    });

    new cdk.CfnOutput(this, 'WsApiId', {
      value:       this.webSocketApi.apiId,
      description: 'Stock Analyser WebSocket API ID',
      exportName:  `StockAnalyserWs-${stage}-WsApiId`,
    });

    new cdk.CfnOutput(this, 'WsApiEndpoint', {
      value:       this.wsApiEndpoint,
      description: 'HTTPS management endpoint for Stock Analyser WebSocket API',
      exportName:  `StockAnalyserWs-${stage}-Endpoint`,
    });

    new cdk.CfnOutput(this, 'ConnectionsTableName', {
      value:       this.connectionsTable.tableName,
      description: 'Stock Analyser DynamoDB table for WebSocket connection state',
      exportName:  `StockAnalyserWs-${stage}-ConnectionsTableName`,
    });
  }
}
