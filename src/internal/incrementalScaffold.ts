import path from 'path'
import { loadConfig } from './loadConfig.js'
import { HandlerWrapperGenerator } from '../generators/HandlerWrapperGenerator.js'
import { PathResolver } from './PathResolver.js'
import { logger } from '../services/Logger.js'
import { ApiBuilder } from '../core/ApiBuilder.js'
import type { ApiDefinition } from '../models/ApiDefinition.js'
import fs from 'fs-extra'

const paths = new PathResolver(import.meta.url)

export async function incrementalScaffold(
    changedFiles: string[],
    outputDir: string,
    currentConfig?: ApiDefinition
): Promise<ApiDefinition> {
    const isConfigChange = changedFiles.some(file =>
        file.includes('api.config')
    )

    if (isConfigChange) {
        logger.info('[Incremental] Config changed, full rebuild required')
        const { apiDefinition } = await loadConfig()

        await fs.ensureDir(outputDir)
        const builder = new ApiBuilder(apiDefinition)
        await builder.generateDevOnly(outputDir)

        return apiDefinition
    }

    const apiDefinition = currentConfig || (await loadConfig()).apiDefinition

    const affectedRoutes = apiDefinition.routes.filter(route => {
        const absRoute = paths.resolve(route.lambda)
        return changedFiles.some(file => {
            const absFile = paths.resolve(file)
            return absFile === absRoute
        })
    })

    if (affectedRoutes.length === 0) {
        logger.info('[Incremental] No routes affected by changes')
        return apiDefinition
    }

    logger.info(`[Incremental] Rebuilding ${affectedRoutes.length} affected route(s)`)

    const generator = new HandlerWrapperGenerator()
    const wrappedDir = path.join(outputDir, 'wrapped')

    for (const route of affectedRoutes) {
        logger.substep(`Rebuilding: ${route.path}`)
        await generator.generateSingleWrapper(route, wrappedDir)
    }

    logger.success('[Incremental] Rebuild complete')
    return apiDefinition
}
