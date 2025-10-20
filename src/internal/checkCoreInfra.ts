import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";

export interface CoreInfraConfig {
    vpcId: string;
    clusterIdentifier: string;
    dbSecretArn: string;
    dbSecurityGroupId: string;
    createDbServiceToken: string;
    dbClusterArn: string;
}


export async function checkCoreInfra(): Promise<CoreInfraConfig> {
    const client = new SSMClient({});

    const paramNames: Record<keyof CoreInfraConfig, string> = {
        vpcId: "/core-stackkit-infra/vpc-id",
        clusterIdentifier: "/core-stackkit-infra/cluster-identifier",
        dbSecretArn: "/core-stackkit-infra/db-secret-arn",
        dbSecurityGroupId: "/core-stackkit-infra/db-security-group-id",
        createDbServiceToken: "/core-stackkit-infra/create-db-service-token",
        dbClusterArn: "/core-stackkit-infra/db-cluster-arn"
    };

    try {
        const results = await Promise.all(
            Object.values(paramNames).map(name =>
                client.send(new GetParameterCommand({ Name: name }))
            )
        );
        const keys = Object.keys(paramNames) as (keyof CoreInfraConfig)[];
        const config: Partial<CoreInfraConfig> = {};
        results.forEach((result, idx) => {
            config[keys[idx]] = result.Parameter?.Value || "";
        });
        return config as CoreInfraConfig;
    } catch (err: any) {
        if (
            err.name === "AccessDeniedException" ||
            err.name === "UnrecognizedClientException"
        ) {
            throw new Error(
                "You are not authorized to access AWS SSM. Make sure you are logged in with an AWS user that has permissions."
            );
        }
        if (
            err.name === "ParameterNotFound" ||
            (err.$metadata && err.$metadata.httpStatusCode === 400)
        ) {
            throw new Error(
                "Core infrastructure is missing or not initialized. Please deploy it with `core:init`."
            );
        }
        throw new Error(
            "Failed to read core infrastructure parameters from SSM: " +
            (err.message || err.toString())
        );
    }
}
