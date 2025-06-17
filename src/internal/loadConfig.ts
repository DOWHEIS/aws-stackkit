import path from 'path'
import { pathToFileURL } from 'url'
import fs from 'fs-extra'
import { ApiDefinition } from '../models/ApiDefinition.js'
import type { ApiConfig } from '../api/types.js'
import {createLogger} from "../services/LoggerService.js";

const logger = createLogger('Internal:loadConfig')
export async function loadConfig(): Promise<{ config: ApiConfig; apiDefinition: ApiDefinition }> {
    const configPath = path.resolve('api.config.ts')
    logger.info('Looking for config at:', configPath)

    if (!await fs.pathExists(configPath)) {
        throw new Error('No api.config.ts found in current directory')
    }

    try {
        const configModule = await import(pathToFileURL(configPath).href)
        logger.info('Loaded module:', configModule)

        const api = configModule.default || Object.values(configModule)[0]
        logger.debug('API object:', api)

        if (api && typeof api.getDefinition === 'function') {
            const apiDefinition = api.getDefinition()
            const config = apiDefinition.config
            return { config, apiDefinition }
        } else {
            throw new Error('Could not load valid api.config.ts')
        }

    } catch (error) {
        logger.error('Error details:', error)
        if (error instanceof Error) {
            throw new Error(`Failed to load api.config.ts: ${error.message}`)
        }
        throw new Error('Failed to load api.config.ts: Unknown error')
    }
}