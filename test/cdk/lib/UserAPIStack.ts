import { CustomResource, Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import { RestApi, LambdaIntegration, Cors } from "aws-cdk-lib/aws-apigateway";
import { Vpc, SubnetType, SecurityGroup, Port } from "aws-cdk-lib/aws-ec2";
import { DatabaseCluster } from "aws-cdk-lib/aws-rds";
import { Secret } from "aws-cdk-lib/aws-secretsmanager";
import { PolicyStatement } from "aws-cdk-lib/aws-iam";
import * as path from "path";
import {
  COMMON_VPC_ID,
  COMMON_CLUSTER_IDENTIFIER,
  COMMON_SECRET_ARN,
} from "../helpers/globalConfig";

export class UserAPIStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // --- API Gateway ---
    const api = new RestApi(this, "UserAPI", {
      restApiName: "User API",
      description: "Simple user api, created with the API Builder SDK",
      defaultCorsPreflightOptions: {
        allowOrigins: Cors.ALL_ORIGINS,
        allowMethods: Cors.ALL_METHODS,
        allowHeaders: [
          "Content-Type",
          "X-Amz-Date",
          "Authorization",
          "X-Api-Key",
          "X-Amz-Security-Token",
          "X-Return-URL",
          "Accept",
        ],
        exposeHeaders: ["X-Auth-Location"],
      },
    });

    // --- Reference shared infra ---
    const vpc = Vpc.fromLookup(this, "UserAPIVpc", { vpcId: COMMON_VPC_ID });
    const secret = Secret.fromSecretCompleteArn(
      this,
      "UserAPIDbSecret",
      COMMON_SECRET_ARN
    );
    const cluster = DatabaseCluster.fromDatabaseClusterAttributes(
      this,
      "UserAPICluster",
      {
        clusterIdentifier: COMMON_CLUSTER_IDENTIFIER,
        port: 5432,
      }
    );
    const lambdaSg = new SecurityGroup(this, "UserAPILambdaSg", {
      vpc,
      allowAllOutbound: true,
      description: "Security group for Lambda functions in UserAPI stack",
    });
    const dbSecurityGroup = SecurityGroup.fromSecurityGroupId(
      this,
      "UserAPIDbSg",
      ""
    );

    dbSecurityGroup.addIngressRule(
      lambdaSg,
      Port.tcp(5432),
      "Allow Lambda access to DB"
    );

    new CustomResource(this, "Custom::UserAPICreateDb", {
      serviceToken: "",
      resourceType: "Custom::CreateDatabase",
      properties: {
        DB_NAME: "user_api_db",
      },
    });

    const ssoLoginLambda = new NodejsFunction(this, "UserAPISsoLoginLambda", {
      entry: path.join(
        __dirname,
        "../wrapped/__internal__/auth_login/index.ts"
      ),
      handler: "main",
      runtime: Runtime.NODEJS_22_X,
    });

    const authResource = api.root.addResource("auth");
    const loginResource = authResource.addResource("prelogin");
    loginResource.addMethod("GET", new LambdaIntegration(ssoLoginLambda));

    const ssoLoginApproveLambda = new NodejsFunction(
      this,
      "UserAPISsoLoginApproveLambda",
      {
        entry: path.join(
          __dirname,
          "../wrapped/__internal__/auth_approve/index.ts"
        ),
        handler: "main",
        runtime: Runtime.NODEJS_22_X,
      }
    );

    const approveResource = authResource.addResource("approve");
    approveResource.addMethod(
      "GET",
      new LambdaIntegration(ssoLoginApproveLambda)
    );

    const lambda0 = new NodejsFunction(this, "UserAPILambda0", {
      entry: path.join(__dirname, "../wrapped/createUser/index.ts"),
      handler: "main",
      runtime: Runtime.NODEJS_22_X,
      vpc,
      vpcSubnets: { subnetType: SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [lambdaSg],
      environment: {
        DB_SECRET_ARN: secret.secretArn,
        DB_NAME: "user_api_db",
        DB_CLUSTER_ARN: cluster.clusterArn,
      },
    });
    lambda0.addToRolePolicy(
      new PolicyStatement({
        actions: ["rds-data:ExecuteStatement"],
        resources: [cluster.clusterArn],
      })
    );
    lambda0.addToRolePolicy(
      new PolicyStatement({
        actions: ["secretsmanager:GetSecretValue"],
        resources: [secret.secretArn],
      })
    );

    const lambda1 = new NodejsFunction(this, "UserAPILambda1", {
      entry: path.join(__dirname, "../wrapped/listUsers/index.ts"),
      handler: "main",
      runtime: Runtime.NODEJS_22_X,
      vpc,
      vpcSubnets: { subnetType: SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [lambdaSg],
      environment: {
        DB_SECRET_ARN: secret.secretArn,
        DB_NAME: "user_api_db",
        DB_CLUSTER_ARN: cluster.clusterArn,
      },
    });
    lambda1.addToRolePolicy(
      new PolicyStatement({
        actions: ["rds-data:ExecuteStatement"],
        resources: [cluster.clusterArn],
      })
    );
    lambda1.addToRolePolicy(
      new PolicyStatement({
        actions: ["secretsmanager:GetSecretValue"],
        resources: [secret.secretArn],
      })
    );

    const lambda2 = new NodejsFunction(this, "UserAPILambda2", {
      entry: path.join(__dirname, "../wrapped/getUser/index.ts"),
      handler: "main",
      runtime: Runtime.NODEJS_22_X,
      vpc,
      vpcSubnets: { subnetType: SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [lambdaSg],
      environment: {
        DB_SECRET_ARN: secret.secretArn,
        DB_NAME: "user_api_db",
        DB_CLUSTER_ARN: cluster.clusterArn,
      },
    });
    lambda2.addToRolePolicy(
      new PolicyStatement({
        actions: ["rds-data:ExecuteStatement"],
        resources: [cluster.clusterArn],
      })
    );
    lambda2.addToRolePolicy(
      new PolicyStatement({
        actions: ["secretsmanager:GetSecretValue"],
        resources: [secret.secretArn],
      })
    );

    const lambda3 = new NodejsFunction(this, "UserAPILambda3", {
      entry: path.join(__dirname, "../wrapped/deleteUser/index.ts"),
      handler: "main",
      runtime: Runtime.NODEJS_22_X,
      vpc,
      vpcSubnets: { subnetType: SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [lambdaSg],
      environment: {
        DB_SECRET_ARN: secret.secretArn,
        DB_NAME: "user_api_db",
        DB_CLUSTER_ARN: cluster.clusterArn,
      },
    });
    lambda3.addToRolePolicy(
      new PolicyStatement({
        actions: ["rds-data:ExecuteStatement"],
        resources: [cluster.clusterArn],
      })
    );
    lambda3.addToRolePolicy(
      new PolicyStatement({
        actions: ["secretsmanager:GetSecretValue"],
        resources: [secret.secretArn],
      })
    );

    const usersResource = api.root.addResource("users");
    usersResource.addMethod("POST", new LambdaIntegration(lambda0));
    usersResource.addMethod("GET", new LambdaIntegration(lambda1));
    const usersIdResource = usersResource.addResource("{id}");
    usersIdResource.addMethod("GET", new LambdaIntegration(lambda2));
    usersIdResource.addMethod("DELETE", new LambdaIntegration(lambda3));
  }
}
