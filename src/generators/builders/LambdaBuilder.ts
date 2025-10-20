// generators/builders/LambdaBuilder.ts
import path from 'path'
import { Builder } from './Builder.js'
import { ApiDefinition } from '../../models/ApiDefinition.js'
import { ProcessedRouteConfig } from '../../api/types.js'

interface EnvVar {
    key: string
    value: string
    isReference?: boolean
}

interface LambdaContext {
    index: number
    lambdaId: string
    handlerName: string
    hasVpc: boolean
    envVars: EnvVar[]
    memory?: number
    timeout?: number
    stackName: string  // from buildBaseContext
}

export class LambdaBuilder extends Builder {

    async build(api: ApiDefinition): Promise<string> {
        const declarations = await this.mapToFragments(
            api.routes,
            (route, index) => this.buildLambda(api, route, index)
        )
        return declarations.join('\n\n')
    }

    private async buildLambda(
        api: ApiDefinition,
        route: ProcessedRouteConfig,
        index: number
    ): Promise<string> {
        const context = this.buildLambdaContext(api, route, index)
        const config = await this.buildLambdaConfig(context)
        const policies = await this.renderIf(
            api.hasDatabase(),
            'lambda/db-policies.mustache',
            { index }
        )

        return this.renderFragment('lambda/declaration.mustache', {
            ...context,
            config,
            policies
        })
    }

    private buildLambdaContext(
        api: ApiDefinition,
        route: ProcessedRouteConfig,
        index: number
    ): LambdaContext {
        const stackName = this.getStackName(api)
        const handlerName = path.basename(route.lambda, path.extname(route.lambda))

        return {
            ...this.buildBaseContext(api),
            index,
            lambdaId: this.getResourceName(stackName, 'Lambda', index),
            handlerName,
            hasVpc: api.hasDatabase(),
            envVars: this.aggregateEnvVars(api, route),
            memory: route.memory,
            timeout: route.timeout
        } as LambdaContext
    }

    private async buildLambdaConfig(context: LambdaContext): Promise<string> {
        const fragments: Array<{ path: string; context: any }> = [
            { path: 'lambda/base-config.mustache', context }
        ]

        if (context.memory) {
            fragments.push({ path: 'lambda/memory-config.mustache', context })
        }

        if (context.timeout) {
            fragments.push({ path: 'lambda/timeout-config.mustache', context })
        }

        if (context.hasVpc) {
            fragments.push({ path: 'lambda/vpc-config.mustache', context: {} })
        }

        if (context.envVars.length > 0) {
            fragments.push({
                path: 'lambda/environment.mustache',
                context: { envVars: context.envVars }
            })
        }

        return this.renderFragments(fragments, ',\n')
    }

    private aggregateEnvVars(api: ApiDefinition, route: ProcessedRouteConfig): EnvVar[] {
        const vars: EnvVar[] = []

        if (api.environment) {
            Object.entries(api.environment).forEach(([key, value]) => {
                vars.push({ key, value, isReference: false })
            })
        }

        if (route.environment) {
            Object.entries(route.environment).forEach(([key, value]) => {
                vars.push({ key, value, isReference: false })
            })
        }

        if (api.hasDatabase()) {
            vars.push(
                { key: 'DB_SECRET_ARN', value: 'secret.secretArn', isReference: true },
                { key: 'DB_NAME', value: `'${this.sanitizeDbName(api.database!.name)}'`, isReference: false },
                { key: 'DB_CLUSTER_ARN', value: 'cluster.clusterArn', isReference: true }
            )
        }

        return vars
    }
}
