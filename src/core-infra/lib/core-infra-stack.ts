import * as cdk from 'aws-cdk-lib';
import {Construct} from 'constructs';
import {Vpc, SubnetType, IpAddresses} from 'aws-cdk-lib/aws-ec2';
import {
    DatabaseCluster,
    DatabaseClusterEngine,
    AuroraPostgresEngineVersion,
    Credentials,
    ClusterInstance,
} from 'aws-cdk-lib/aws-rds';
import {Secret} from 'aws-cdk-lib/aws-secretsmanager';
import {RemovalPolicy} from 'aws-cdk-lib';
import {NodejsFunction} from "aws-cdk-lib/aws-lambda-nodejs";
import * as path from "node:path";
import {Runtime} from "aws-cdk-lib/aws-lambda";
import {Provider} from "aws-cdk-lib/custom-resources";

export class CoreInfraStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        const vpc = new Vpc(this, 'aws-stackkit-api-vpc', {
            ipAddresses: IpAddresses.cidr('10.50.0.0/16'),
            natGateways: 1,
            subnetConfiguration: [
                {
                    name: 'private-egress',
                    subnetType: SubnetType.PRIVATE_WITH_EGRESS,
                    cidrMask: 24,
                },
                {
                    name: 'public',
                    subnetType: SubnetType.PUBLIC,
                    cidrMask: 24,
                },
            ],
            availabilityZones: ['us-east-2a', 'us-east-2b'],
        });

        const dbSecret = new Secret(this, 'DbCredentialsSecret', {
            generateSecretString: {
                secretStringTemplate: JSON.stringify({username: 'dbadmin'}),
                generateStringKey: 'password',
                excludePunctuation: true,
            },
        });

        const cluster = new DatabaseCluster(this, 'SharedDbCluster', {
            engine: DatabaseClusterEngine.auroraPostgres({
                version: AuroraPostgresEngineVersion.VER_16_8,
            }),
            credentials: Credentials.fromSecret(dbSecret),
            vpc,
            defaultDatabaseName: 'postgres',
            writer: ClusterInstance.serverlessV2('writer'),
            serverlessV2MinCapacity: 0.5,
            serverlessV2MaxCapacity: 4,
            removalPolicy: RemovalPolicy.DESTROY,
            deletionProtection: false,
            vpcSubnets: {
                subnetType: SubnetType.PRIVATE_WITH_EGRESS,
            },
            enableDataApi: true,
        });

        const onEventHandler = new NodejsFunction(this, 'SharedCreateDbLambda', {
            entry: path.join(__dirname, '../lambda/createDb.ts'),
            handler: 'main',
            runtime: Runtime.NODEJS_22_X,
            vpc,
            timeout: cdk.Duration.seconds(60),
            vpcSubnets: {subnetType: SubnetType.PRIVATE_WITH_EGRESS},
            // securityGroups: cluster.connections.securityGroups,
            environment: {
                DB_SECRET_ARN: dbSecret.secretArn,
                CLUSTER_ARN: cluster.clusterArn,
            },
            bundling: {
                externalModules: [],
            },
        })

        onEventHandler.addToRolePolicy(new cdk.aws_iam.PolicyStatement({
            actions: ['rds-data:ExecuteStatement'],
            resources: [cluster.clusterArn],
        }))

        onEventHandler.addToRolePolicy(new cdk.aws_iam.PolicyStatement({
            actions: ['secretsmanager:GetSecretValue'],
            resources: [dbSecret.secretArn],
        }))


        const provider = new Provider(this, 'CreateDbProvider', {
            onEventHandler,
        })

        //export ARNs for use in generated stacks
        this.exportValue(provider.serviceToken, {name: 'CoreCreateDbServiceToken'})
        this.exportValue(vpc.vpcId, {name: 'CoreVpcId'});
        this.exportValue(cluster.clusterIdentifier, {name: 'CoreClusterIdentifier'});
        this.exportValue(cluster.clusterArn, {name: 'CoreClusterArn'});
        this.exportValue(dbSecret.secretArn, {name: 'CoreDbSecretArn'});
        this.exportValue(cluster.connections.securityGroups[0].securityGroupId, { name: 'CoreDbSecurityGroupId' });
    }
}
