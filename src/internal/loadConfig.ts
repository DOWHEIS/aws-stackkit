import { pathToFileURL } from 'url'
import fs from 'fs-extra'
import { ApiDefinition } from '../models/ApiDefinition.js'
import { PathResolver } from "./PathResolver.js"
import { ImportParser } from './ImportParser.js'
import { logger } from '../services/Logger.js'


async function maybeEnableTsx(file: string) {
    if (/\.[mc]?tsx?$/.test(file)) {
        try { const { register } = await import('tsx/esm/api'); register(); } catch {
            console.log('Please install tsx to use TypeScript configuration files: npm install tsx');
        }
    }
}

export async function loadConfig(): Promise<{ apiDefinition: ApiDefinition }> {
    const paths = new PathResolver(import.meta.url)
    const configPath = paths.user('api.config.ts')

    logger.info('Looking for config at:', configPath)

    if (!await fs.pathExists(configPath)) {
        throw new Error('No api.config.ts found in current directory')
    }

    try {
        const importMap = await ImportParser.parseImports(configPath)

        ApiDefinition.setImportMap(importMap)

        await maybeEnableTsx(configPath);
        const configUrl = pathToFileURL(configPath).href + `?t=${Date.now()}`;
        const configModule = await import(configUrl)

        const api = configModule.default || Object.values(configModule)[0]

        if (!api) {
            throw new Error('api.config.ts must export an API configuration')
        }

        if (typeof api.getDefinition === 'function') {
            const apiDefinition = api.getDefinition(ApiDefinition)

            if (!(apiDefinition instanceof ApiDefinition)) {
                throw new Error('getDefinition() must return an ApiDefinition instance')
            }

            return { apiDefinition }
        } else {
            throw new Error('Exported object must have a getDefinition() method')
        }
    } catch (error) {
        logger.error('Error details:', error)
        if (error instanceof Error) {
            throw new Error(`Failed to load api.config.ts: ${error.message}`)
        }
        throw new Error('Failed to load api.config.ts: Unknown error')
    }
}

function logLoadedConfig(configModule: any) {
    const api = configModule.default || Object.values(configModule)[0]

    if (!api?.config) {
        logger.info('Loaded module (no config found)')
        return
    }

    const config = api.config

    logger.section('Loaded API Configuration')

    logger.info(`Name: ${config.name}`)
    if (config.description) {
        logger.info(`Description: ${config.description}`)
    }

    if (config.database) {
        logger.substep('Database:')
        logger.info(`  - Name: ${config.database.name}`)
        if (config.database.migrationsPath) {
            logger.info(`  - Migrations: ${config.database.migrationsPath}`)
        } else {
            logger.info(`  - Migrations: auto-discover (./migrations, ./src/migrations, ./database/migrations)`)
        }
    }

    if (config.apiKeys?.enabled) {
        logger.substep('API Keys: enabled')
        if (config.apiKeys.clients) {
            logger.info(`  - ${config.apiKeys.clients.length} client(s) configured`)
        }
    }

    if (config.throttling) {
        logger.substep('Global Throttling:')
        logger.info(`  - Rate limit: ${config.throttling.rateLimit || 10} req/sec`)
        logger.info(`  - Burst limit: ${config.throttling.burstLimit || 20} requests`)
    }

    if (config.routes && config.routes.length > 0) {
        logger.substep(`Routes: ${config.routes.length} configured`)

        const authTypes = {
            none: 0,
            sso: 0,
            apiKey: 0
        }

        config.routes.forEach((route: any) => {
            if (!route.auth) {
                authTypes.none++
            } else if (route.auth === true || route.auth.type === 'sso') {
                authTypes.sso++
            } else if (route.auth.type === 'apiKey') {
                authTypes.apiKey++
            }
        })

        if (authTypes.none > 0) logger.info(`  - ${authTypes.none} public route(s)`)
        if (authTypes.sso > 0) logger.info(`  - ${authTypes.sso} SSO-protected route(s)`)
        if (authTypes.apiKey > 0) logger.info(`  - ${authTypes.apiKey} API key-protected route(s)`)

        const maxRoutesToShow = 3
        const routesToShow = config.routes.slice(0, maxRoutesToShow)

        logger.info('  Routes:')
        routesToShow.forEach((route: any) => {
            const auth = !route.auth ? 'public' :
                route.auth === true || route.auth.type === 'sso' ? 'SSO' :
                    'API key'
            logger.info(`    - ${route.method} ${route.path} (${auth})`)
        })

        if (config.routes.length > maxRoutesToShow) {
            logger.info(`    ... and ${config.routes.length - maxRoutesToShow} more`)
        }
    }

    if (config.environment) {
        const envCount = Object.keys(config.environment).length
        if (envCount > 0) {
            logger.substep(`Environment: ${envCount} variable(s) configured`)
        }
    }

    logger.info('')
}
