import type { ApiConfig, InferRouteConfig } from '../api/types.js'
import { ApiDefinition } from '../models/ApiDefinition.js'
import { ApiBuilder } from '../core/ApiBuilder.js'
import {z} from "zod";
import {ApiConfigSchema, createApiConfigSchema} from "./schemas.js";

type ValidatedApiConfig = z.infer<typeof ApiConfigSchema>

export class ConfigurableApi<C extends ValidatedApiConfig = ValidatedApiConfig> {
    private config: C;
    private _definition: ApiDefinition | null = null;
    private configSchema: z.ZodType<C, any, any>

    constructor(config: C) {
        this.configSchema = createApiConfigSchema(config)
        this.config = this.configSchema.parse(config)
    }

    addRoute(route: InferRouteConfig<C>): this {
        this.config.routes!.push(route as any);
        this._definition = null;
        return this;
    }

    getDefinition(ApiDefinitionClass = ApiDefinition): ApiDefinition {
        if (!this._definition) {
            this._definition = ApiDefinitionClass.from(this.config);
        }
        return this._definition;
    }
    async generate(outputDir: string = 'cdk'): Promise<void> {
        const definition = this.getDefinition();
        const builder = new ApiBuilder(definition);
        await builder.generate(outputDir);
    }

    addRoutes(routes: InferRouteConfig<C>[]): this {
        routes.forEach(route => this.addRoute(route));
        return this;
    }

    withDatabase(database: ApiConfig['database']): this {
        this.config.database = database;
        this._definition = null;
        return this;
    }

    withEnvironment(environment: Record<string, string>): this {
        this.config.environment = environment;
        this._definition = null;
        return this;
    }
}

export function createApi<const T extends z.infer<typeof ApiConfigSchema>>(
    config: T
): ConfigurableApi<T> {
    return new ConfigurableApi(config);
}
