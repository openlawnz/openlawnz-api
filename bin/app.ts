#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { AppStack } from '../lib/app-stack';

require('dotenv').config()

const DEPLOYMENT_KEY: string = process.env.DEPLOYMENT_KEY!

if (
	!process.env.DEPLOYMENT_MAP ||
	!process.env.DEPLOYMENT_KEY
) {
	throw new Error("Missing required environment variables");
}

const DEPLOYMENT_MAP: {
	[index: string]: {
		environment: string,
		domainName: string
	}
} = JSON.parse(process.env.DEPLOYMENT_MAP!);


const toDeploy = DEPLOYMENT_MAP[DEPLOYMENT_KEY];

if (!toDeploy) {
	throw new Error(`No matching deployment. Passed in key '${DEPLOYMENT_KEY}'`)
}

const environmentToDeploy = toDeploy.environment;

const app = new cdk.App();

new AppStack(app, 'OpenlawnzApiStack' + environmentToDeploy, {
	env: {
		account: process.env.CDK_DEFAULT_ACCOUNT,
		region: process.env.CDK_DEFAULT_REGION
	}
});