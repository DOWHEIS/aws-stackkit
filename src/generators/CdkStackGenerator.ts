import path from 'path'
import { TemplateService } from '../services/TemplateService.js'
import { Generator } from './Generator.js'
import { ApiDefinition } from '../models/ApiDefinition.js'
import { LambdaBuilder } from './builders/LambdaBuilder.js'
import { RouteBuilder } from './builders/RouteBuilder.js'
import { DatabaseBuilder } from './builders/DatabaseBuilder.js'
import { ApiConfigBuilder } from './builders/ApiConfigBuilder.js'

export class CdkStackGenerator implements Generator {
    private lambdaBuilder: LambdaBuilder
    private routeBuilder: RouteBuilder
    private databaseBuilder: DatabaseBuilder
    private apiConfigBuilder: ApiConfigBuilder

    constructor(private templateService: TemplateService) {
        this.lambdaBuilder = new LambdaBuilder(templateService)
        this.routeBuilder = new RouteBuilder(templateService)
        this.databaseBuilder = new DatabaseBuilder(templateService)
        this.apiConfigBuilder = new ApiConfigBuilder(templateService)
    }

    async generate(api: ApiDefinition, outputDir: string): Promise<void> {
        const context = await this.buildContext(api)
        const stackClassName = context.stackClassName

        await this.templateService.renderToFile(
            'stack.mustache',
            context,
            path.join(outputDir, 'lib', `${stackClassName}.ts`)
        )
    }

    private async buildContext(api: ApiDefinition) {
        const stackName = this.getStackName(api.name)

        let infra = ''
        let dbResource = ''
        if (api.hasDatabase()) {
            const dbResult = await this.databaseBuilder.build(stackName, api.database!.name)
            infra = dbResult.infrastructure
            dbResource = dbResult.customResource
        }

        const apiConfig = await this.apiConfigBuilder.build(api)

        const [lambdaDecls, routeDecls] = await Promise.all([
            this.lambdaBuilder.build(api),
            this.routeBuilder.build(api.routes)
        ])

        return {
            stackClassName: `${stackName}Stack`,
            stackResourceId: stackName,
            name: api.name,
            description: api.description ?? '',
            infra,
            lambdaDecls,
            routeDecls,
            dbResource,
            // hasAuthRoutes: api,
            apiKeys: apiConfig.apiKeys,
            usagePlan: apiConfig.usagePlan,
        }
    }

    private getStackName(apiName: string): string {
        return apiName.replace(/\s+/g, '')
    }
}
