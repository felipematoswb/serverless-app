import { Duration, RemovalPolicy, Stack, StackProps } from 'aws-cdk-lib';
import { AccessLogField, AccessLogFormat, AuthorizationType, CognitoUserPoolsAuthorizer, LambdaIntegration, LogGroupLogDestination, MethodLoggingLevel, RestApi } from 'aws-cdk-lib/aws-apigateway';
import { AccountRecovery, DateTimeAttribute, OAuthScope, UserPool, UserPoolClientIdentityProvider, VerificationEmailStyle } from 'aws-cdk-lib/aws-cognito';
import { AttributeType, BillingMode, Table } from 'aws-cdk-lib/aws-dynamodb';
import { PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { Code, Function, Runtime } from 'aws-cdk-lib/aws-lambda';
import { LogGroup } from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

export class ServerlessAppStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // Create DB
    const blogdb = new Table(this, 'blogdb', {
      partitionKey: { name: 'id', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      tableName: 'blogdb',
      removalPolicy: RemovalPolicy.DESTROY
    });

    // Create Auth Cognito
    const poolCognitoApi = new UserPool(this, 'authCognitoApi', {
      userPoolName: 'poolCognitoApi',
      signInCaseSensitive: false,
      removalPolicy: RemovalPolicy.DESTROY,
      selfSignUpEnabled: true,
      userVerification: {
        emailSubject: 'Verify your email for our awesome app!',
        emailBody: 'Thanks for signing up to our awesome app! Your verification code is {####}',
        emailStyle: VerificationEmailStyle.CODE,
        smsMessage: 'Thanks for signing up to our awesome app! Your verification code is {####}',
      },
      signInAliases: {
        username: true,
        email: true
      },
      standardAttributes: {
        email: {
          required: true,
          mutable: true
        }
      },
      customAttributes: {
        'joinedOn': new DateTimeAttribute(),
      },
      passwordPolicy: {
        minLength: 12,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
        tempPasswordValidity: Duration.days(3)
      },
      accountRecovery: AccountRecovery.EMAIL_ONLY,
    });

    // Create App Client
    poolCognitoApi.addClient('clientAppAuth', {
      supportedIdentityProviders: [
        UserPoolClientIdentityProvider.COGNITO
      ],
      oAuth: {
        flows: {
          authorizationCodeGrant: true
        },
        scopes: [OAuthScope.OPENID],
        callbackUrls: ['http://localhost:8080/'],
        logoutUrls: ['http://localhost:8080/']
      },
      preventUserExistenceErrors: true,
    });

    // Create Domain to Access
    // poolCognitoApi.addDomain('appCognitoDomain', {
    //   cognitoDomain: {
    //     domainPrefix: 'auth-awesome-product-app'
    //   }
    // });

    // Create Role to Lambda Access DB
    const roleLambdaAccessDB = new Role(this, 'roleLambdaAccessDB', {
      assumedBy: new ServicePrincipal('lambda.amazonaws.com')
    });

    roleLambdaAccessDB.addToPolicy(new PolicyStatement({
      resources: [blogdb.tableArn],
      actions: [
        "dynamodb:BatchGetItem",
        "dynamodb:GetItem",
        "dynamodb:Query",
        "dynamodb:Scan",
        "dynamodb:BatchWriteItem",
        "dynamodb:PutItem",
        "dynamodb:UpdateItem",
      ]
    }));

    // Add Access Cloudwatch to Lambda
    roleLambdaAccessDB.addToPolicy(new PolicyStatement({
      resources: ['*'],
      actions: [
        "logs:CreateLogStream",
        "logs:PutLogEvents",
        "logs:CreateLogGroup"
      ]
    }));

    // Create Lambda
    const crudLambdaFn = new Function(this, 'crudLambdaFn', {
      runtime: Runtime.NODEJS_16_X,
      handler: 'index.handler',
      code: Code.fromAsset("backend-lambda"),
      functionName: 'crudLambdaFn',
      role: roleLambdaAccessDB
    });

    // APIG LogGroup
    const logGroupAPI = new LogGroup(this, 'logGroupsAPI');

    // Init Autorizer Cognito
    const authApiAccess = new CognitoUserPoolsAuthorizer(this, 'authApiAcess', {
      cognitoUserPools: [poolCognitoApi]
    });

    // Create APIG
    const apiBlog = new RestApi(this, 'api-blog', {
      restApiName: 'api-blog',
      description: 'api blog to test serverless app',
      deployOptions: {
        stageName: 'dev',
        accessLogDestination: new LogGroupLogDestination(logGroupAPI),
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
      defaultCorsPreflightOptions: {
        allowHeaders: [
          'Content-Type',
          'X-Amz-Date',
          'Authorization',
          'X-Api-Key',
        ],
        allowMethods: ['OPTIONS', 'GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
        allowCredentials: true,
        allowOrigins: ['http://localhost:3000'],
      }
    });

    // Create Integration APIGxLambda
    const blogLambdaIntegration = new LambdaIntegration(crudLambdaFn);

    // Create Resource Root
    const blogRootResource = apiBlog.root.addResource('posts');
    blogRootResource.addMethod('GET', blogLambdaIntegration, {
      authorizer: authApiAccess,
      authorizationType: AuthorizationType.COGNITO
    });
    blogRootResource.addMethod('PUT', blogLambdaIntegration, {
      authorizer: authApiAccess,
      authorizationType: AuthorizationType.COGNITO
    });

    // Create Tree Resource 
    const blogResource = blogRootResource.addResource('{id}');
    blogResource.addMethod('GET', blogLambdaIntegration, {
      authorizer: authApiAccess,
      authorizationType: AuthorizationType.COGNITO
    });
    blogResource.addMethod('DELETE', blogLambdaIntegration, {
      authorizer: authApiAccess,
      authorizationType: AuthorizationType.COGNITO
    });

  }
}