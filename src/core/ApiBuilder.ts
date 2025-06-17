import { ApiDefinition } from '../models/ApiDefinition.js'
import { TemplateService } from '../services/TemplateService.js'
import { Generator } from '../generators/Generator.js'
import { CdkStackGenerator } from '../generators/CdkStackGenerator.js'
import { CdkAppGenerator } from '../generators/CdkAppGenerator.js'
import { PackageJsonGenerator } from '../generators/PackageJsonGenerator.js'
import { TsconfigGenerator } from '../generators/TsconfigGenerator.js'
import { CdkJsonGenerator } from '../generators/CdkJsonGenerator.js'
import { HandlerWrapperGenerator } from '../generators/HandlerWrapperGenerator.js'
import { AuthGenerator } from '../generators/AuthGenerator.js'
import {HelpersGenerator} from "../generators/HelpersGenerator.js";
import {createLogger} from "../services/LoggerService.js";

export class ApiBuilder {
    private readonly templateService: TemplateService
    private readonly generators: Generator[]
    private logger = createLogger('Core:ApiBuilder')

    constructor(private readonly api: ApiDefinition) {
        this.templateService = new TemplateService()
        this.generators = this.createGenerators()
    }

    async generate(outputDir: string): Promise<void> {
        this.logger.info(`Generating infrastructure for ${this.api.name}...`)
        this.logger.info(`${this.api.routes.length} routes, ${this.api.hasAuth() ? 'with' : 'without'} auth, ${this.api.hasDatabase() ? 'with' : 'without'} database`)

        let generatedCount = 0

        for (const generator of this.generators) {
            try {
                await generator.generate(this.api, outputDir)
                generatedCount++
            } catch (error) {
                this.logger.error(`Failed to run ${generator.constructor.name}:`, error)
                throw error
            }
        }

        this.logger.success(`Generated complete infrastructure in ${outputDir}`)
        this.logger.success(`${generatedCount} generators completed successfully`)
        this.printNextSteps(outputDir)
    }

    private createGenerators(): Generator[] {
        const generators: Generator[] = []

        this.logger.info('Planning generation...')

        generators.push(
            new CdkStackGenerator(this.templateService),
            new CdkAppGenerator(this.templateService),
            new PackageJsonGenerator(this.templateService),
            new TsconfigGenerator(this.templateService),
            new CdkJsonGenerator(this.templateService),
            new HelpersGenerator()
        )
        this.logger.info('  Core CDK files')

        generators.push(new HandlerWrapperGenerator())
        this.logger.info('  Handler wrappers')

        if (this.api.hasAuth()) {
            generators.push(new AuthGenerator())
            this.logger.info('  Auth components (SSO enabled)')
        }

        this.logger.info(`${generators.length} generators ready`)
        return generators
    }

    private printNextSteps(outputDir: string): void {
        this.logger.success('\nScaffolding complete!')
        this.logger.info('\nNext steps:')
        this.logger.info(`  check ${outputDir} for generated files`)
        this.logger.info(`  for deployment, run: cdk deploy in ${outputDir} or use the deploy command in the CLI`)


        if (this.api.hasAuth()) {
            this.logger.info('\nAuth is enabled:')
        }

        if (this.api.hasDatabase()) {
            this.logger.info('\nDatabase is configured:')
            this.logger.info(`  - Database: ${this.api.database!.name}`)
            this.logger.info('  - Connection details will be available via environment variables')
        }
    }

    static from(api: ApiDefinition): ApiBuilder {
        return new ApiBuilder(api)
    }

    validate(): { valid: boolean; errors: string[] } {
        const errors: string[] = []

        if (!this.api.name?.trim()) {
            errors.push('API name is required')
        }

        if (!this.api.routes || this.api.routes.length === 0) {
            errors.push('At least one route is required')
        }

        for (const route of this.api.routes || []) {
            if (!route.path) {
                errors.push(`Route missing path: ${JSON.stringify(route)}`)
            }
            if (!route.method) {
                errors.push(`Route missing method: ${route.path}`)
            }
            if (!route.lambda) {
                errors.push(`Route missing lambda: ${route.path}`)
            }
        }

        if (this.api.hasDatabase() && !this.api.database?.name) {
            errors.push('Database name is required when database is enabled')
        }

        return {
            valid: errors.length === 0,
            errors
        }
    }
}