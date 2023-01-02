#!/usr/bin/env node
import 'source-map-support/register';
import { App } from 'aws-cdk-lib';
import { ServerlessAppStack } from '../lib/serverless-app-stack';

const app = new App();
new ServerlessAppStack(app, 'ServerlessAppStack');