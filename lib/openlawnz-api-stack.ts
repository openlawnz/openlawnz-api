import * as cdk from '@aws-cdk/core';
import * as lambda from '@aws-cdk/aws-lambda-nodejs';
import * as apigw from '@aws-cdk/aws-apigateway';
import * as sm from "@aws-cdk/aws-secretsmanager";
import * as route53 from '@aws-cdk/aws-route53';
import * as targets from '@aws-cdk/aws-route53-targets';
import { SecurityGroup, Vpc } from "@aws-cdk/aws-ec2";
import * as acm from '@aws-cdk/aws-certificatemanager';
import { HostedZone } from '@aws-cdk/aws-route53';

require('dotenv').config()

if (
	!process.env.CERTIFICATE_ARN ||
	!process.env.SECURITY_GROUP_IDS ||
	!process.env.VPC_ID ||
	!process.env.SECRET_ARN ||
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

export class OpenlawnzApiStack extends cdk.Stack {
	constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {

		super(scope, id, props);

		const toDeploy = DEPLOYMENT_MAP[DEPLOYMENT_KEY];

		if (!toDeploy) {
			throw new Error(`No matching deployment. Passed in key '${DEPLOYMENT_KEY}'`)
		}

		const environmentToDeploy = toDeploy.environment;
		const domainToDeploy = toDeploy.domainName;

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
			securityGroups: SECURITY_GROUP_IDS.map(s => SecurityGroup.fromLookup(this, s + 'id-' + Math.floor(Math.random() * 9999), s)),
			bundling: {
				nodeModules: [
					'express',
					'@graphile-contrib/pg-simplify-inflector',
					'@graphile/pro',
					'aws-serverless-express',
					'graphile-utils',
					'pg',
					'postgraphile'
				],
				externalModules: ['pg-native']
			},
			handler: 'handler'
		});

		const certificate = acm.Certificate.fromCertificateArn(this, 'Certificate', CERTIFICATE_ARN);

		const api = new apigw.LambdaRestApi(this, `API${environmentToDeploy}`, {
			handler: APILambda,
			defaultCorsPreflightOptions: {
				allowOrigins: apigw.Cors.ALL_ORIGINS,
				allowMethods: apigw.Cors.ALL_METHODS // this is also the default
			},
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