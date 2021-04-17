#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { OpenlawnzApiStack } from '../lib/openlawnz-api-stack';

const app = new cdk.App();

new OpenlawnzApiStack(app, 'OpenlawnzApiStack', {
    env: {
        account: process.env.CDK_DEFAULT_ACCOUNT,
        region: process.env.CDK_DEFAULT_REGION
    }
});