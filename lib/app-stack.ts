import * as cdk from 'aws-cdk-lib';
import { Cors, EndpointType, LambdaRestApi, SecurityPolicy } from 'aws-cdk-lib/aws-apigateway';
import { Certificate } from 'aws-cdk-lib/aws-certificatemanager';
import { SecurityGroup, Vpc } from 'aws-cdk-lib/aws-ec2';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { ARecord, HostedZone, RecordTarget } from 'aws-cdk-lib/aws-route53';
import { Construct } from 'constructs';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import * as sm from "aws-cdk-lib/aws-secretsmanager";
require('dotenv').config()

if (
  !process.env.CERTIFICATE_ARN ||
  !process.env.SECURITY_GROUP_IDS ||
  !process.env.VPC_ID ||
  !process.env.SECRET_ARN ||
  !process.env.LAYER_ARN ||
  !process.env.DEPLOYMENT_KEY ||
  !process.env.HOSTED_ZONE_DOMAIN_NAME ||
  !process.env.DEPLOYMENT_MAP
) {
  throw new Error("Missing required environment variables");
}

const SECRET_ARN: string = process.env.SECRET_ARN;
const CERTIFICATE_ARN: string = process.env.CERTIFICATE_ARN;
const VPC_ID: string = process.env.VPC_ID;
const SECURITY_GROUP_IDS: string[] = process.env.SECURITY_GROUP_IDS.split(",");
const DEPLOYMENT_KEY: string = process.env.DEPLOYMENT_KEY!
const HOSTED_ZONE_DOMAIN_NAME: string = process.env.HOSTED_ZONE_DOMAIN_NAME!
const DEPLOYMENT_MAP: {
  [index: string]: {
    environment: string,
    domainName: string
  }
} = JSON.parse(process.env.DEPLOYMENT_MAP!)

export class AppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const toDeploy = DEPLOYMENT_MAP[DEPLOYMENT_KEY];

    if (!toDeploy) {
      throw new Error(`No matching deployment. Passed in key '${DEPLOYMENT_KEY}'`)
    }

    const environmentToDeploy = toDeploy.environment;
    const domainToDeploy = toDeploy.domainName;

    const secret = sm.Secret.fromSecretAttributes(this, "ImportedSecret", {
      secretCompleteArn: SECRET_ARN
    });

    id = id + environmentToDeploy

    const vpc = Vpc.fromLookup(this, VPC_ID, { isDefault: true })

    const APILambda = new NodejsFunction(this, `APIHandler${environmentToDeploy}`, {
      entry: 'src/index.js',
      environment: {
        STAGE: environmentToDeploy,
        DB_HOST: secret.secretValueFromJson('DB_HOST').unsafeUnwrap(),
        PORT: secret.secretValueFromJson('PORT').unsafeUnwrap(),
        DB_USER: secret.secretValueFromJson('DB_USER').unsafeUnwrap(),
        DB_PASSWORD: secret.secretValueFromJson('DB_PASSWORD').unsafeUnwrap(),
        GRAPHILE_LICENSE: secret.secretValueFromJson('GRAPHILE_LICENSE').unsafeUnwrap()
      },
      memorySize: 512,
      vpc,
      runtime: Runtime.NODEJS_18_X,
      allowPublicSubnet: true,
      securityGroups: SECURITY_GROUP_IDS.map(s => SecurityGroup.fromSecurityGroupId(this, s + 'id-' + Math.floor(Math.random() * 9999), s)),
      bundling: {
        nodeModules: [
          'express',
          '@graphile-contrib/pg-simplify-inflector',
          '@graphile/pro',
          'graphile-utils',
          'pg',
          'postgraphile'
        ],
        externalModules: ['pg-native']
      },
      handler: 'handler'
    });

    // https://docs.aws.amazon.com/mediaconnect/latest/ug/iam-policy-examples-asm-secrets.html#iam-policy-examples-asm-specific-secrets

    const certificate = Certificate.fromCertificateArn(this, 'Certificate', CERTIFICATE_ARN);

    const api = new LambdaRestApi(this, `API${environmentToDeploy}`, {
      handler: APILambda,
      defaultCorsPreflightOptions: {
        allowOrigins: Cors.ALL_ORIGINS,
        allowMethods: Cors.ALL_METHODS // this is also the default
      },
      domainName: {
        domainName: domainToDeploy,
        certificate,
        endpointType: EndpointType.EDGE,
        securityPolicy: SecurityPolicy.TLS_1_2
      },

    });

    const hostedZone = HostedZone.fromLookup(this, 'MyZone', {
      domainName: HOSTED_ZONE_DOMAIN_NAME
    });

    new ARecord(this, 'CustomDomainAliasRecord', {
      zone: hostedZone,
      recordName: domainToDeploy,
      target: RecordTarget.fromAlias(new targets.ApiGateway(api))
    });


  }
}
