import fs from 'fs-extra'
import { loadConfig } from './loadConfig.js'
import { ApiBuilder } from '../core/ApiBuilder.js'
import { logger } from '../services/Logger.js'

export async function scaffoldDev(outputDir: string = '.cdk_dev'): Promise<void> {
    try {
        logger.section('[dev] Loading api.config.ts...')
        const { apiDefinition } = await loadConfig()
        logger.success(`[dev] Loaded config for "${apiDefinition.name}"`)

        await fs.ensureDir(outputDir)

        const builder = new ApiBuilder(apiDefinition)
        await builder.generateDevOnly(outputDir)

    } catch (err) {
        logger.error('[dev] scaffoldDev failed:', err)
        if (err instanceof Error) {
            logger.error(err.stack || '')
        }
        process.exit(1)
    }
}
