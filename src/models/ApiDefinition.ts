import {ApiConfig} from "../api/types.js";

export class ApiDefinition {
    constructor(readonly config: ApiConfig) {
    }

    static from(config: ApiConfig): ApiDefinition {
        return new ApiDefinition(config);
    }

    hasDatabase(): boolean {
        return !!this.config.database
    }

    hasAuth(): boolean {
        return this.config.routes?.some( r => r.auth) ?? false
    }

    get name(): string {
        return this.config.name;
    }

    get description(): string | undefined {
        return this.config.description
    }

    get routes() {
        return this.config.routes ?? []
    }

    get database() {
        return this.config.database
    }

    get environment() {
        return this.config.environment
    }


}