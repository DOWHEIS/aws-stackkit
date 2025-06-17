import path from 'path'
import fs from 'fs-extra'
import { loadConfig } from '../internal/loadConfig.js'
import { runCommand } from '../internal/runCommand.js'
import {
    writeLastDeployedConfig,
    readLastDeployedConfig
} from '../internal/sdkmeta.js'
import { createLogger } from '../services/LoggerService.js'

const logger = createLogger('Deploy')

function hasDestructiveChanges(current: any, previous: any): boolean {
    return (
        current.database?.name &&
        previous?.database?.name &&
        current.database.name !== previous.database.name
    )
}

export async function deploy({ force = false } = {}) {
    try {
        const { config: currentConfig } = await loadConfig()

        const previousConfig = await readLastDeployedConfig()
        if (!force && hasDestructiveChanges(currentConfig, previousConfig)) {
            logger.error('\nDatabase name changed!')
            logger.error('This may create a new DB inside the shared cluster.\n')
            logger.error('To continue anyway, run with --force.\n')
            process.exit(1)
        }

        const cdkDir = path.resolve('cdk')
        if (!await fs.pathExists(cdkDir)) {
            logger.error('CDK directory not found')
            logger.error('Run "scaffold" first to generate CDK files')
            process.exit(1)
        }

        logger.info('Deploying CDK stack...')

        try {
            await runCommand('npx', ['cdk', 'deploy'], cdkDir)

            const stackName = currentConfig.name.replace(/\s+/g, '') + 'Stack'
            await writeLastDeployedConfig(currentConfig, stackName)
            logger.success(`\nSuccessfully deployed ${stackName} and saved metadata.`)

            logger.success('\nDeployment complete!')
            if (currentConfig.database) {
                logger.info('Don\'t forget to run migrations: npx api-sdk migrate')
            }
        } catch (err) {
            logger.error('\nDeployment failed:', err instanceof Error ? err.message : String(err))
            process.exit(1)
        }

    } catch (error) {
        logger.error('Deploy command failed:', error instanceof Error ? error.message : String(error))
        process.exit(1)
    }
}