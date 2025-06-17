import path from 'path'
import fs from 'fs-extra'
import { ApiBuilder } from '../core/ApiBuilder.js'
import { loadConfig } from '../internal/loadConfig.js'
import { runCommand } from '../internal/runCommand.js'
import { formatCdk } from '../internal/format.js'
import { createLogger } from '../services/LoggerService.js'

const logger = createLogger('Scaffold')

export async function scaffold(outputDir: string = 'cdk-refactors'): Promise<void> {
    try {
        logger.info('Loading api.config.ts...')
        const { config, apiDefinition } = await loadConfig()
        logger.success(`Loaded config for "${config.name}"`)

        const builder = ApiBuilder.from(apiDefinition)
        const validation = builder.validate()
        if (!validation.valid) {
            logger.error('Configuration validation failed:')
            validation.errors.forEach(error => logger.error(`  • ${error}`))
            process.exit(1)
        }

        await fs.ensureDir(outputDir)
        await builder.generate(outputDir)

        const cdkDir = path.resolve(process.cwd(), outputDir)
        logger.info(`Installing npm dependencies in ${cdkDir}...`)
        await runCommand('npm', ['install'], cdkDir)
        logger.success('Dependencies installed successfully')

        logger.info('Formatting generated code with Prettier...')
        await formatCdk()
        logger.success('Code formatted')
    } catch (error) {
        logger.error('Scaffolding failed:', error)
        if (error instanceof Error) {
            logger.error('Stack trace:', error.stack)
        }
        process.exit(1)
    }
}