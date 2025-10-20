import {ApiConfig, ProcessedApiConfig, ProcessedRouteConfig} from "../api/types.js";

export class ApiDefinition {
    private readonly _config: ProcessedApiConfig;
    private static importMap: Map<string, string> | null = null;

    private constructor(config: ProcessedApiConfig) {
        this._config = this.validateConfig(config);
    }

    static from(config: ApiConfig): ApiDefinition {
        const processedConfig = this.processLambdaFunctions(config);
        return new ApiDefinition(processedConfig);
    }

    static setImportMap(map: Map<string, string>): void {
        this.importMap = map;
    }

    private static processLambdaFunctions(config: ApiConfig): ProcessedApiConfig {
        if (!config.routes) return config as ProcessedApiConfig;

        const processedRoutes: ProcessedRouteConfig[] = config.routes.map(route => {
            if (typeof route.lambda === 'function') {
                const lambdaPath = this.resolveFunctionPath(route.lambda)
                return { ...route, lambda: lambdaPath }
            }
            return route as ProcessedRouteConfig
        });

        return { ...config, routes: processedRoutes };
    }

    static logImportMap(): void {
        if (!this.importMap) {
            console.log('Import map is not set.');
            return;
        }

        console.log('Current import map entries:');
        for (const [key, value] of this.importMap.entries()) {
            console.log(`  ${key} => ${value}`);
        }
    }

    private static resolveFunctionPath(fn: Function): string {
        if (!this.importMap) {
            this.logImportMap();
            throw new Error('Import map not set. Make sure to load config through loadConfig()');
        }

        const functionName = fn.name;
        const filePath = this.importMap.get(functionName);

        if (!filePath) {
            const available = Array.from(this.importMap.keys()).join(', ');
            throw new Error(
                `Could not find import for function "${functionName}". ` +
                `Available imports: ${available}`
            );
        }

        return filePath;
    }

    private validateConfig(config: ProcessedApiConfig): ProcessedApiConfig {
        const errors: string[] = [];

        if (!config.name?.trim()) {
            errors.push('API name is required');
        }

        if (!config.routes || config.routes.length === 0) {
            errors.push('At least one route is required');
        }

        for (const route of config.routes || []) {
            if (!route.path) {
                errors.push(`Route missing path: ${JSON.stringify(route)}`);
            }
            if (!route.method) {
                errors.push(`Route missing method: ${route.path}`);
            }
            if (!route.lambda) {
                errors.push(`Route missing lambda: ${route.path}`);
            }
            if (typeof route.lambda === 'function') {
                errors.push(`Route lambda must be a file path, not a function: ${route.path}`);
            }
        }

        if (config.database && !config.database.name) {
            errors.push('Database name is required when database is enabled');
        }

        if (errors.length > 0) {
            throw new Error(`Invalid API configuration:\n${errors.map(e => `  - ${e}`).join('\n')}`);
        }

        return config;
    }

    hasDatabase(): boolean {
        return !!this._config.database;
    }

    hasApiKeyAuth(): boolean {
        return this._config.routes?.some(r => r.auth?.type === "apiKey") ?? false;
    }

    get name(): string {
        return this._config.name;
    }

    get description(): string | undefined {
        return this._config.description;
    }

    get routes(): ProcessedRouteConfig[] {
        return this._config.routes ?? [];
    }

    get database() {
        return this._config.database;
    }

    get environment() {
        return this._config.environment;
    }

    get config(): Readonly<ProcessedApiConfig> {
        return this._config;
    }

    getSummary(): string {
        return `${this.routes.length} routes, ${this.hasApiKeyAuth() ? 'with' : 'without'} Api key auth, ${this.hasDatabase() ? 'with' : 'without'} database`;
    }
}
