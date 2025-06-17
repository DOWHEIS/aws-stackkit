import path from 'path'
import { COMMON_CREATE_DB_SERVICE_TOKEN, COMMON_DB_SECURITY_GROUP_ID } from '../helpers/globalConfig.js'
import { TemplateService } from '../services/TemplateService.js'
import { Generator } from './Generator.js'
import { ApiDefinition } from '../models/ApiDefinition.js'
import {RouteConfig} from "../api/types.js";

export class CdkStackGenerator implements Generator {
    constructor(private templateService: TemplateService) {}

    async generate(api: ApiDefinition, outputDir: string): Promise<void> {
        const context = this.buildContext(api)
        const stackClassName = context.stackClassName

        await this.templateService.renderToFile(
            'stack.mustache',
            context,
            path.join(outputDir, 'lib', `${stackClassName}.ts`)
        )
    }

    private buildContext(api: ApiDefinition) {
        const stackName = this.getStackName(api.name)

        return {
            stackClassName: `${stackName}Stack`,
            stackResourceId: stackName,
            name: api.name,
            description: api.description ?? '',
            infra: api.hasDatabase() ? this.buildDatabaseInfra(stackName) : '',
            lambdaDecls: this.buildAllLambdas(api),
            routeDecls: this.buildAllRoutes(api.routes),
            dbResource: api.hasDatabase() ? this.buildDbCreationResource(stackName, api.database!.name) : '',
            hasAuthRoutes: api.hasAuth(),
        }
    }

    private getStackName(apiName: string): string {
        return apiName.replace(/\s+/g, '')
    }

    private sanitizeDbName(name: string): string {
        return name.replace(/[^a-zA-Z0-9_]/g, '_')
    }

    private buildDatabaseInfra(stackName: string): string {
        return `
    // --- Reference shared infra ---
    const vpc = Vpc.fromLookup(this, '${stackName}Vpc', { vpcId: COMMON_VPC_ID })
    const secret = Secret.fromSecretCompleteArn(this, '${stackName}DbSecret', COMMON_SECRET_ARN)
    const cluster = DatabaseCluster.fromDatabaseClusterAttributes(this, '${stackName}Cluster', {
      clusterIdentifier: COMMON_CLUSTER_IDENTIFIER,
      port: 5432
    })
    const lambdaSg = new SecurityGroup(this, '${stackName}LambdaSg', {
        vpc,
        allowAllOutbound: true,
        description: 'Security group for Lambda functions in ${stackName} stack'
    })
    const dbSecurityGroup = SecurityGroup.fromSecurityGroupId(this, '${stackName}DbSg', '${COMMON_DB_SECURITY_GROUP_ID}')
    
    dbSecurityGroup.addIngressRule(lambdaSg, Port.tcp(5432), 'Allow Lambda access to DB')
    `
    }

    private buildDbCreationResource(stackName: string, dbName: string): string {
        return `
    new CustomResource(this, 'Custom::${stackName}CreateDb', {
      serviceToken: '${COMMON_CREATE_DB_SERVICE_TOKEN}',
      resourceType: 'Custom::CreateDatabase',
      properties: {
        DB_NAME: '${this.sanitizeDbName(dbName)}'
      }
    })`
    }

    private buildAllLambdas(api: ApiDefinition): string {
        return api.routes
            .map((route, index) => this.buildSingleLambda(api, route, index))
            .join('\n\n')
    }

    private buildSingleLambda(api: ApiDefinition, route: RouteConfig, index: number): string {
        const stackName = this.getStackName(api.name)
        const handlerName = path.basename(route.lambda, path.extname(route.lambda))
        const lambdaId = `${stackName}Lambda${index}`

        const baseConfig = this.getLambdaBaseConfig(handlerName, lambdaId)
        const envConfig = this.getLambdaEnvConfig(api, route)
        const vpcConfig = api.hasDatabase() ? this.getLambdaVpcConfig() : ''
        const policies = api.hasDatabase() ? this.getLambdaPolicies(index) : ''

        return `    const lambda${index} = new NodejsFunction(this, '${lambdaId}', {
${baseConfig}${vpcConfig}${envConfig}
    })${policies}`
    }

    private getLambdaBaseConfig(handlerName: string, lambdaId: string): string {
        return `      entry: path.join(__dirname, '../wrapped/${handlerName}/index.ts'),
      handler: 'main',
      runtime: Runtime.NODEJS_22_X,`
    }

    private getLambdaVpcConfig(): string {
        return `
      vpc,
      vpcSubnets: { subnetType: SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [lambdaSg]`
    }

    private getLambdaEnvConfig(api: ApiDefinition, route: RouteConfig): string {
        const envVars: string[] = []

        if (api.environment) {
            Object.entries(api.environment).forEach(([key, value]) => {
                envVars.push(`        ${key}: '${value}',`)
            })
        }

        if (route.environment) {
            Object.entries(route.environment).forEach(([key, value]) => {
                envVars.push(`        ${key}: '${value}',`)
            })
        }

        if (api.hasDatabase()) {
            const dbName = this.sanitizeDbName(api.database!.name)
            envVars.push(
                `        DB_SECRET_ARN: secret.secretArn,`,
                `        DB_NAME: '${dbName}',`,
                `        DB_CLUSTER_ARN: cluster.clusterArn,`
            )
        }

        return envVars.length ? `,
      environment: {
${envVars.join('\n')}
      }` : ''
    }

    private getLambdaPolicies(lambdaIndex: number): string {
        return `
    lambda${lambdaIndex}.addToRolePolicy(new PolicyStatement({
      actions: ['rds-data:ExecuteStatement'],
      resources: [cluster.clusterArn],
    }))
    lambda${lambdaIndex}.addToRolePolicy(new PolicyStatement({
      actions: ['secretsmanager:GetSecretValue'],
      resources: [secret.secretArn],
    }))`
    }

    private buildAllRoutes(routes: RouteConfig[]): string {
        const routeBuilder = new RouteBuilder()

        routes.forEach((route, index) => {
            routeBuilder.addRoute(route.path, route.method, index)
        })

        return routeBuilder.generateCode()
    }
}

class RouteBuilder {
    private lines: string[] = []
    private resourceMap = new Map<string, string>()

    addRoute(routePath: string, method: string, lambdaIndex: number): void {
        const resourceVar = this.ensureResourceExists(routePath)
        this.addMethodToResource(resourceVar, method, lambdaIndex)
    }

    private ensureResourceExists(routePath: string): string {
        const pathParts = routePath.split('/').filter(Boolean)
        let currentPath = ''
        let currentVar = 'api.root'

        for (const part of pathParts) {
            currentPath += '/' + part

            if (!this.resourceMap.has(currentPath)) {
                const varName = this.createResourceVarName(currentPath)
                this.lines.push(`    const ${varName} = ${currentVar}.addResource('${part}')`)
                this.resourceMap.set(currentPath, varName)
            }

            currentVar = this.resourceMap.get(currentPath)!
        }

        return currentVar
    }

    private addMethodToResource(resourceVar: string, method: string, lambdaIndex: number): void {
        this.lines.push(
            `    ${resourceVar}.addMethod('${method}', new LambdaIntegration(lambda${lambdaIndex}))`
        )
    }

    private createResourceVarName(path: string): string {
        return path.replace(/\/(\{.*?\}|[^\/]+)/g, (_, part) => {
            if (part.startsWith('{')) {
                return part.slice(1, -1)
                    .replace(/[^a-zA-Z0-9]/g, '')
                    .replace(/^./, (c: string) => c.toUpperCase())
            } else {
                return part.replace(/[^a-zA-Z0-9]/g, '')
                    .replace(/^./, (c: string) => c.toLowerCase())
            }
        }) + 'Resource'
    }

    generateCode(): string {
        return this.lines.join('\n')
    }
}