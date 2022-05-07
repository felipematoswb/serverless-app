import { Stack, StackProps} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Table, AttributeType, BillingMode } from 'aws-cdk-lib/aws-dynamodb';
import { Function, Runtime, Code } from 'aws-cdk-lib/aws-lambda';
import { Role, ServicePrincipal, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { RestApi, LambdaIntegration, LogGroupLogDestination, AccessLogFormat, MethodLoggingLevel, AccessLogField } from 'aws-cdk-lib/aws-apigateway';
import { LogGroup } from 'aws-cdk-lib/aws-logs';

export class ServerlessAppStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const dynamodb = new Table(this, 'Table', {
      partitionKey: { name: 'id', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      tableName: 'tutorial-items'
    });

    const roleToLambda = new Role(this, 'RoleToLambda', {
      assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
    });

    roleToLambda.addToPolicy(new PolicyStatement({
      resources: [dynamodb.tableArn],
      actions: [
        "dynamodb:BatchGetItem",
        "dynamodb:GetItem",
        "dynamodb:Query",
        "dynamodb:Scan",
        "dynamodb:BatchWriteItem",
        "dynamodb:PutItem",
        "dynamodb:UpdateItem",
      ],
    }));

    roleToLambda.addToPolicy(new PolicyStatement({
      resources:['*'],
      actions: [
        "logs:CreateLogStream",
				"logs:PutLogEvents",
        "logs:CreateLogGroup"
      ]
    }))

    const fn = new Function(this, 'MyFunction', {
      runtime: Runtime.NODEJS_12_X,
      handler: 'index.handler',
      code: Code.fromAsset("lambda"),
      functionName: 'tutorial-function',
      role: roleToLambda
    });

    const logGroup = new LogGroup(this, "ApiGatewayAccessLogs");

    const api = new RestApi(this, 'tutorial-api', {
      restApiName: 'tutorial-api',

      description: 'tutorial api gateway',
      deployOptions: {
        stageName: 'dev',
        accessLogDestination: new LogGroupLogDestination(logGroup),
        accessLogFormat: AccessLogFormat.custom(JSON.stringify({
                requestId: AccessLogField.contextRequestId(),
                sourceIp: AccessLogField.contextIdentitySourceIp(),
                extendedRequestId: AccessLogField.contextExtendedRequestId(),
                caller: AccessLogField.contextIdentityCaller(),
                user: AccessLogField.contextIdentityUser(),
                requestTime: AccessLogField.contextRequestTime(),
                httpMethod: AccessLogField.contextHttpMethod(),
                resourcePath: AccessLogField.contextResourcePath(),
                status: AccessLogField.contextStatus(),
                protocol: AccessLogField.contextProtocol(),
                responseLength: AccessLogField.contextResponseLength(),
                userAgent: AccessLogField.contextIdentityUserAgent(),
                apiId: AccessLogField.contextApiId()
             })),
        loggingLevel: MethodLoggingLevel.INFO,
        metricsEnabled: true
      },
    });

    const itemsIntegration = new LambdaIntegration(fn);

    const items = api.root.addResource('items');
    items.addMethod('GET', itemsIntegration);
    items.addMethod('PUT', itemsIntegration);

    const item = items.addResource('{id}');
    item.addMethod('GET', itemsIntegration);
    item.addMethod('DELETE', itemsIntegration);

  }
}