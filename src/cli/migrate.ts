import path from 'path'
import fs from 'fs-extra'
import { readdir, readFile } from 'fs/promises'
import { RDSDataClient, ExecuteStatementCommand } from '@aws-sdk/client-rds-data'
import { loadConfig } from '../internal/loadConfig.js'
import { PathResolver } from '../internal/PathResolver.js'

import { logger } from '../services/Logger.js'
import {checkCoreInfra} from "../internal/checkCoreInfra.js";

const DEFAULT_MIGRATION_PATHS = [
    './migrations',
    './src/migrations',
    './database/migrations'
]

export async function migrate() {
    let infra: Awaited<ReturnType<typeof checkCoreInfra>>
    try {
        infra = await checkCoreInfra()
        const paths = new PathResolver(import.meta.url)
        const { apiDefinition } = await loadConfig()

        if (!apiDefinition.database) {
            logger.warn('No database configured - skipping migrations')
            return
        }

        logger.section(`Running migrations for database: ${apiDefinition.database.name}`)

        const dataApi = new RDSDataClient({})

        async function exec(sql: string) {
            await dataApi.send(new ExecuteStatementCommand({
                resourceArn: infra.dbClusterArn,
                secretArn: infra.dbSecretArn,
                database: apiDefinition.database!.name,
                sql
            }))
        }

        logger.substep('Ensuring _migrations table exists...')
        await exec(`CREATE TABLE IF NOT EXISTS _migrations (id TEXT PRIMARY KEY,run_at TIMESTAMP DEFAULT now());`)

        let migrationsDir: string

        if (apiDefinition.database.migrationsPath) {
            migrationsDir = paths.resolve(apiDefinition.database.migrationsPath)
        } else {
            const foundPath = DEFAULT_MIGRATION_PATHS.find(p =>
                fs.existsSync(paths.user(p))
            )

            if (!foundPath) {
                logger.warn('No migrations directory found in default locations:')
                DEFAULT_MIGRATION_PATHS.forEach(p => logger.substep(p))
                logger.info('Create migrations using: npx api-sdk create:migration <n>')
                return
            }

            migrationsDir = paths.user(foundPath)
            logger.info(`Auto-discovered migrations in: ${paths.toRelative(migrationsDir)}`)
        }

        if (!await fs.pathExists(migrationsDir)) {
            logger.warn(`Migrations directory not found: ${paths.toRelative(migrationsDir)}`)
            logger.info('Create migrations using: npx api-sdk create:migration <n>')
            return
        }

        const files = (await readdir(migrationsDir))
            .filter(f => f.endsWith('.sql'))
            .sort()

        if (files.length === 0) {
            logger.info('No migration files found')
            logger.info('Create migrations using: npx api-sdk create:migration <n>')
            return
        }

        logger.info(`Found ${files.length} migration file(s)`)

        let ranCount = 0
        for (const file of files) {
            const id = path.basename(file)

            const { records } = await dataApi.send(new ExecuteStatementCommand({
                resourceArn: infra.dbClusterArn,
                secretArn: infra.dbSecretArn,
                database: apiDefinition.database.name,
                sql: `SELECT 1 FROM _migrations WHERE id = :id`,
                parameters: [{ name: 'id', value: { stringValue: id } }]
            }))

            if (records && records.length) {
                logger.substep(`Skipping ${id} (already run)`)
                continue
            }

            logger.substep(`Running ${id}...`)
            const fullContent = await readFile(path.join(migrationsDir, file), 'utf-8')

            //split on @@rollback to only run the "up" part
            const [upContent] = fullContent.split('@@rollback')
            const sql = upContent.trim()

            try {
                await exec(sql)
                await exec(`INSERT INTO _migrations (id) VALUES ('${id}')`)
                logger.success(`Completed ${id}`)
                ranCount++
            } catch (error) {
                logger.error(`Failed to run ${id}:`, error)
                process.exit(1)
            }
        }

        if (ranCount === 0) {
            logger.info('All migrations are up to date')
        } else {
            logger.success(`Successfully ran ${ranCount} migration(s)`)
        }

    } catch (error) {
        logger.error('Migration failed:', error)
        process.exit(1)
    }
}
