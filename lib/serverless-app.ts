import { Stack, StackProps, Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Table, AttributeType, BillingMode } from 'aws-cdk-lib/aws-dynamodb';
import { Function, Runtime, Code } from 'aws-cdk-lib/aws-lambda';
import { Role, ServicePrincipal, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { RestApi, LambdaIntegration } from 'aws-cdk-lib/aws-apigateway';
import { UserPool, VerificationEmailStyle, AccountRecovery } from 'aws-cdk-lib/aws-cognito';

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

    const api = new RestApi(this, 'tutorial-api', {
      restApiName: 'tutorial-api'
    });

    const itemsIntegration = new LambdaIntegration(fn);

    const items = api.root.addResource('items');
    items.addMethod('GET', itemsIntegration);
    items.addMethod('PUT', itemsIntegration);

    const item = items.addResource('{id}');
    item.addMethod('GET', itemsIntegration);
    item.addMethod('DELETE', itemsIntegration);

    // cognito
    const userPool = new UserPool(this, 'myuserpool', {
      
      selfSignUpEnabled: true,
      userVerification: {
        emailSubject: 'Verify your email for our awesome app!',
        emailBody: 'Thanks for signing up to our awesome app! Your verification code is {####}',
        emailStyle: VerificationEmailStyle.CODE,
      },

      signInAliases: {
        email: true,
      },

      standardAttributes: {
        nickname: {
          required: true,
          mutable: false,
        },
        email: {
          required: true,
          mutable: false,
        },
      },

      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
        tempPasswordValidity: Duration.days(3),
      },

      accountRecovery: AccountRecovery.EMAIL_ONLY,
    });

    userPool.addClient('app-client', {
      accessTokenValidity: Duration.minutes(60),
      idTokenValidity: Duration.minutes(60),
      refreshTokenValidity: Duration.days(30),
      preventUserExistenceErrors: true,
      enableTokenRevocation: true,
    })

    userPool.addDomain('app-domain', {
      cognitoDomain: {
        domainPrefix: 'appdomaincdktesting'
      }
    })
  }
}
