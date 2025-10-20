import { ApiDefinition } from '../models/ApiDefinition.js'
import { TemplateService } from '../services/TemplateService.js'
import { Generator } from '../generators/Generator.js'
import { CdkStackGenerator } from '../generators/CdkStackGenerator.js'
import { CdkAppGenerator } from '../generators/CdkAppGenerator.js'
import { PackageJsonGenerator } from '../generators/PackageJsonGenerator.js'
import { TsconfigGenerator } from '../generators/TsconfigGenerator.js'
import { CdkJsonGenerator } from '../generators/CdkJsonGenerator.js'
import { HandlerWrapperGenerator } from '../generators/HandlerWrapperGenerator.js'
// import { AuthGenerator } from '../generators/AuthGenerator.js'
import { HelpersGenerator } from "../generators/HelpersGenerator.js"
import { logger } from '../services/Logger.js'

export class ApiBuilder {
    private readonly templateService: TemplateService;

    constructor(private readonly apiDefinition: ApiDefinition) {
        this.templateService = new TemplateService();
    }

    async generate(outputDir: string): Promise<void> {
        logger.section(`Generating infrastructure for ${this.apiDefinition.name}`);
        logger.info(this.apiDefinition.getSummary());

        const generators = this.createGenerators();
        let generatedCount = 0;

        for (const generator of generators) {
            try {
                await logger.duration(`Running ${generator.constructor.name}`, async () => {
                    await generator.generate(this.apiDefinition, outputDir);
                });
                generatedCount++;
            } catch (error) {
                logger.error(`Failed to run ${generator.constructor.name}:`, error);
                throw error;
            }
        }

        logger.success(`Generated complete infrastructure in ${outputDir}`);
        logger.info(`${generatedCount} generators completed successfully`);
        this.printNextSteps(outputDir);
    }

    async generateDevOnly(outputDir: string): Promise<void> {
        logger.section(`Generating dev server updates for ${this.apiDefinition.name}`);

        const generators: Generator[] = [
            new PackageJsonGenerator(this.templateService),
            new HandlerWrapperGenerator()
        ];

        // if (this.apiDefinition.hasSSOAuth()) {
        //     generators.push(new AuthGenerator());
        // }

        let generatedCount = 0;
        for (const generator of generators) {
            try {
                await logger.duration(`Running ${generator.constructor.name}`, async () => {
                    await generator.generate(this.apiDefinition, outputDir);
                });
                generatedCount++;
            } catch (error) {
                logger.error(`Failed to run ${generator.constructor.name}:`, error);
                throw error;
            }
        }

        logger.success(`Generated dev server updates in ${outputDir}`);
    }

    private createGenerators(): Generator[] {
        logger.info('Planning generation...');

        const generators: Generator[] = [
            new CdkStackGenerator(this.templateService),
            new CdkAppGenerator(this.templateService),
            new PackageJsonGenerator(this.templateService),
            new TsconfigGenerator(this.templateService),
            new CdkJsonGenerator(this.templateService),
            new HelpersGenerator(),
            new HandlerWrapperGenerator()
        ];
        logger.substep('Core CDK files and handler wrappers');

        // if (this.apiDefinition.hasSSOAuth()) {
        //     generators.push(new AuthGenerator());
        //     logger.substep('Auth components (SSO enabled)');
        // }

        logger.info(`${generators.length} generators ready`);
        return generators;
    }

    private printNextSteps(outputDir: string): void {
        logger.banner('Scaffolding complete!');

        // if (this.apiDefinition.hasSSOAuth()) {
        //     logger.section('SSO Auth is enabled:');
        //     logger.info('  - SSO login will be available at /auth/prelogin');
        //     logger.info('  - Auth approval at /auth/approve');
        // }

        if (this.apiDefinition.hasApiKeyAuth()) {
            logger.section('API Key authentication is enabled:');
            logger.info('  - API keys can be managed in the AWS console');
            logger.info('  - Use the generated API key in your requests');
        }

        if (this.apiDefinition.hasDatabase()) {
            logger.section('Database is configured:');
            logger.info(`  - Database: ${this.apiDefinition.database!.name}`);
            logger.info('  - Connection details will be available via environment variables');
        }
    }
}
