import path from 'path'
import fs from 'fs-extra'
import { readLastDeployedConfig } from '../internal/sdkmeta.js'
import { ApiDefinition } from '../models/ApiDefinition.js'
import { ApiBuilder } from '../core/ApiBuilder.js'
import { formatCdk } from '../internal/format.js'
import { logger } from '../services/Logger.js'

export async function rollback() {
    try {
        const lastConfig = await readLastDeployedConfig()

        if (!lastConfig) {
            logger.error('No last-deployed config found.')
            logger.info('Deploy at least once before using rollback')
            process.exit(1)
        }

        logger.section('Rebuilding CDK files from last-deployed config...')
        logger.info(`Rolling back to: ${lastConfig.name}`)

        const apiDefinition = ApiDefinition.from(lastConfig)

        const cdkDir = path.resolve('cdk')
        logger.info(`Cleaning CDK directory: ${cdkDir}`)
        await fs.remove(cdkDir)
        await fs.ensureDir(cdkDir)

        const builder = new ApiBuilder(apiDefinition)
        await builder.generate(cdkDir)

        logger.info('Formatting generated code...')
        await formatCdk(false, import.meta.url)

        logger.banner('Rollback complete!')
        logger.success('CDK files restored from last-deployed config')
        logger.info('Run "npm install" in the cdk directory if needed')

    } catch (error) {
        logger.error('Rollback failed:', error)
        process.exit(1)
    }
}
