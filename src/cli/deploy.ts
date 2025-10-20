import path from 'path'
import fs from 'fs-extra'
import { loadConfig } from '../internal/loadConfig.js'
import { runCommand } from '../internal/runCommand.js'
import {
    writeLastDeployedConfig,
    readLastDeployedConfig
} from '../internal/sdkmeta.js'
import { logger } from '../services/Logger.js'

function hasDestructiveChanges(current: any, previous: any): boolean {
    return (
        current.database?.name &&
        previous?.database?.name &&
        current.database.name !== previous.database.name
    )
}

export async function deploy({ force = false } = {}) {
    try {
        const { apiDefinition: currentConfig } = await loadConfig()

        const previousConfig = await readLastDeployedConfig()
        if (!force && hasDestructiveChanges(currentConfig, previousConfig)) {
            logger.section('Database name changed!');
            logger.warn('This may create a new DB inside the shared cluster.');
            logger.info('To continue anyway, run with --force.');
            process.exit(1);
        }

        const cdkDir = path.resolve('cdk')
        if (!await fs.pathExists(cdkDir)) {
            logger.error('CDK directory not found');
            logger.info('Run scaffold first to generate CDK files');
            process.exit(1);
        }

        logger.section('Deploying CDK stack...');

        try {
            await logger.duration('cdk deploy', async () => {
                await runCommand('npx', ['cdk', 'deploy'], cdkDir)
            });

            const stackName = currentConfig.name.replace(/\s+/g, '') + 'Stack'
            await writeLastDeployedConfig(currentConfig, stackName)
            logger.success(`Successfully deployed ${stackName} and saved metadata.`);

            logger.banner('Deployment complete!');
            if (currentConfig.database) {
                logger.info('Don\'t forget to run migrations: npx api-sdk migrate');
            }
        } catch (err) {
            logger.banner('Deployment failed!');
            logger.error('Deployment failed:', err instanceof Error ? err.message : String(err));
            process.exit(1);
        }

    } catch (error) {
        logger.banner('Deploy command failed!');
        logger.error('Deploy command failed:', error instanceof Error ? error.message : String(error));
        process.exit(1);
    }
}
