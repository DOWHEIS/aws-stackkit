import type { ApiConfig, RouteConfig } from './types.js'
import { ApiDefinition } from '../models/ApiDefinition.js'
import { ApiBuilder as InfraApiBuilder } from '../core/ApiBuilder.js'
import {createLogger} from "../services/LoggerService.js";


export class ApiBuilder {
    private readonly definition: ApiDefinition
    private logger = createLogger('ApiBuilder')

    constructor(config: ApiConfig) {
        this.definition = ApiDefinition.from(config)
        if (!this.definition.config.routes) this.definition.config.routes = []
    }

    addRoute(route: RouteConfig): void {
        this.definition.config.routes!.push(route)
    }

    addAuth(fn: (event: any) => any): void {
        this.definition.config.auth = fn
    }

    getDefinition(): ApiDefinition {
        return this.definition
    }

    async generate(outputDir: string = 'cdk'): Promise<void> {
        const infra = new InfraApiBuilder(this.definition)

        const validation = infra.validate()
        if(!validation.valid) {
            this.logger.error('API configuration validation failed:')
            validation.errors.forEach(err => this.logger.error(`- ${err}`))
            throw new Error('Invalid API configuration')
        }
        await infra.generate(outputDir)
    }

}

export function createApi(config: ApiConfig): ApiBuilder {
    return new ApiBuilder(config)
}
