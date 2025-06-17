#!/usr/bin/env ts-node

import { App } from "aws-cdk-lib";
import { UserAPIStack } from "../lib/UserAPIStack";

const app = new App();
new UserAPIStack(app, "UserAPIStack", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: "us-east-2",
  },
});
