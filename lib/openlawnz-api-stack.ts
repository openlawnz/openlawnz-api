import * as cdk from '@aws-cdk/core';
import * as lambda from '@aws-cdk/aws-lambda-nodejs';
import * as apigw from '@aws-cdk/aws-apigateway';
import * as sm from "@aws-cdk/aws-secretsmanager";
import * as route53 from '@aws-cdk/aws-route53';
import * as targets from '@aws-cdk/aws-route53-targets';
import { SecurityGroup, Vpc } from "@aws-cdk/aws-ec2";
import * as acm from '@aws-cdk/aws-certificatemanager';
import { HostedZone } from '@aws-cdk/aws-route53';
import 'path';

require('dotenv').config()

if (
  !process.env.CERTIFICATE_ARN ||
  !process.env.SECURITY_GROUP_IDS ||
  !process.env.VPC_ID ||
  !process.env.SECRET_ARN ||
  !process.env.POSTGRAPHILE_CACHE_FILE_S3 ||
  !process.env.HOSTED_ZONE_DOMAIN_NAME ||
  !process.env.DEPLOYMENT_MAP
) {
  throw new Error("Missing required environment variables");
}

const SECRET_ARN: string = process.env.SECRET_ARN;
const CERTIFICATE_ARN: string = process.env.CERTIFICATE_ARN;
const VPC_ID: string = process.env.VPC_ID;
const SECURITY_GROUP_IDS: string[] = process.env.SECURITY_GROUP_IDS.split(",");
const POSTGRAPHILE_CACHE_FILE_S3 = process.env.POSTGRAPHILE_CACHE_FILE_S3;
const ENVIRONMENT: string = process.env.CODEBUILD_SOURCE_VERSION!
const HOSTED_ZONE_DOMAIN_NAME: string = process.env.HOSTED_ZONE_DOMAIN_NAME!
const DEPLOYMENT_MAP: {
  [index: string]: {
    environment: string,
    domainName: string
  }
} = JSON.parse(process.env.DEPLOYMENT_MAP!)

export class OpenlawnzApiStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {

    super(scope, id, props);

    const branchToDeploy = DEPLOYMENT_MAP[ENVIRONMENT];

    if (!branchToDeploy) {
      throw new Error(`No matching branch to deploy. Passed in '${ENVIRONMENT}'`)
    }

    const environmentToDeploy = branchToDeploy.environment;
    const domainToDeploy = branchToDeploy.domainName;

    id = id + environmentToDeploy

    const secret = sm.Secret.fromSecretAttributes(this, "API_SECRETS", { secretArn: SECRET_ARN });

    const DB_HOST = secret.secretValueFromJson("DB_HOST").toString();
    const DB_PORT = secret.secretValueFromJson("PORT").toString();
    const DB_USER = secret.secretValueFromJson("DB_USER").toString();
    const DB_PASSWORD = secret.secretValueFromJson("DB_PASSWORD").toString();
    const GRAPHILE_LICENSE = secret.secretValueFromJson("GRAPHILE_LICENSE").toString();

    const vpc = Vpc.fromLookup(this, VPC_ID, { isDefault: true })

    const APILambda = new lambda.NodejsFunction(this, `APIHandler${environmentToDeploy}`, {
      entry: 'src/index.js',
      environment: {
        STAGE: environmentToDeploy,
        DB_HOST,
        DB_PORT,
        DB_USER,
        DB_PASSWORD,
        GRAPHILE_LICENSE
      },
      memorySize: 512,
      vpc,
      allowPublicSubnet: true,
      securityGroups: SECURITY_GROUP_IDS.map(s => SecurityGroup.fromLookup(this, s + '-api-id', s)),
      bundling: {
        nodeModules: [
          'express',
          '@graphile-contrib/pg-simplify-inflector',
          '@graphile/pro',
          'aws-serverless-express',
          'cors',
          'graphile-utils',
          'pg',
          'postgraphile'
        ],
        externalModules: ['pg-native'],
        commandHooks: {
          // Copy a file so that it will be included in the bundled asset
          afterBundling(inputDir: string, outputDir: string): string[] {
            return [`aws s3 cp s3://${POSTGRAPHILE_CACHE_FILE_S3} ${path.join(__dirname, outputDir)}`];
          },
          // CDK Typescript failing if these not present
          beforeBundling(): string[] {
            return [];
          },
          beforeInstall(): string[] {
            return [];
          }
        }
      },
      handler: 'handler'
    });

    const certificate = acm.Certificate.fromCertificateArn(this, 'Certificate', CERTIFICATE_ARN);

    const api = new apigw.LambdaRestApi(this, `API${environmentToDeploy}`, {
      handler: APILambda,
      domainName: {
        domainName: domainToDeploy,
        certificate,
        endpointType: apigw.EndpointType.EDGE,
        securityPolicy: apigw.SecurityPolicy.TLS_1_2
      },

    });

    const hostedZone = HostedZone.fromLookup(this, 'MyZone', {
      domainName: HOSTED_ZONE_DOMAIN_NAME
    });

    new route53.ARecord(this, 'CustomDomainAliasRecord', {
      zone: hostedZone,
      recordName: domainToDeploy,
      target: route53.RecordTarget.fromAlias(new targets.ApiGateway(api))
    });

  }
}