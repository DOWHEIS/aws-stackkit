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

export class ApiBuilder {
    private readonly templateService: TemplateService
    private readonly generators: Generator[]

    constructor(private readonly api: ApiDefinition) {
        this.templateService = new TemplateService()
        this.generators = this.createGenerators()
    }

    async generate(outputDir: string): Promise<void> {
        console.log(`Generating infrastructure for ${this.api.name}...`)
        console.log(`${this.api.routes.length} routes, ${this.api.hasAuth() ? 'with' : 'without'} auth, ${this.api.hasDatabase() ? 'with' : 'without'} database`)

        let generatedCount = 0

        for (const generator of this.generators) {
            try {
                await generator.generate(this.api, outputDir)
                generatedCount++
            } catch (error) {
                console.error(`Failed to run ${generator.constructor.name}:`, error)
                throw error
            }
        }

        console.log(`Generated complete infrastructure in ${outputDir}`)
        console.log(`${generatedCount} generators completed successfully`)
        this.printNextSteps(outputDir)
    }

    private createGenerators(): Generator[] {
        const generators: Generator[] = []

        console.log('Planning generation...')

        generators.push(
            new CdkStackGenerator(this.templateService),
            new CdkAppGenerator(this.templateService),
            new PackageJsonGenerator(this.templateService),
            new TsconfigGenerator(this.templateService),
            new CdkJsonGenerator(this.templateService),
            new HelpersGenerator()
        )
        console.log('  Core CDK files')

        generators.push(new HandlerWrapperGenerator())
        console.log('  Handler wrappers')

        if (this.api.hasAuth()) {
            generators.push(new AuthGenerator())
            console.log('  Auth components (SSO enabled)')
        }

        console.log(`${generators.length} generators ready`)
        return generators
    }

    private printNextSteps(outputDir: string): void {
        console.log('\nScaffolding complete!')
        console.log('\nNext steps:')
        console.log(`  cd ${outputDir}`)
        console.log('  npm install')
        console.log('  npm run synth     # Generate CloudFormation')
        console.log('  npm run deploy    # Deploy to AWS')

        if (this.api.hasAuth()) {
            console.log('\nAuth is enabled:')
            console.log('  - SSO login will be available at /auth/prelogin')
            console.log('  - Auth approval at /auth/approve')
        }

        if (this.api.hasDatabase()) {
            console.log('\nDatabase is configured:')
            console.log(`  - Database: ${this.api.database!.name}`)
            console.log('  - Connection details will be available via environment variables')
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