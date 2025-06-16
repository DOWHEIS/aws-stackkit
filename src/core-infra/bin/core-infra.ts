#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { CoreInfraStack } from '../lib/core-infra-stack';

const app = new cdk.App();
new CoreInfraStack(app, 'CoreInfraStack', {
    env: {
        account: process.env.CDK_DEFAULT_ACCOUNT,
        region: 'us-east-2',
    },
});