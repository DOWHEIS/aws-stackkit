import path from 'path'
import fs from 'fs-extra'
import { readdir, readFile } from 'fs/promises'
import { RDSDataClient, ExecuteStatementCommand } from '@aws-sdk/client-rds-data'
import { loadConfig } from '../internal/loadConfig.js'
import {
    COMMON_CLUSTER_ARN,
    COMMON_SECRET_ARN
} from '../helpers/globalConfig.js'
import { createLogger } from '../services/LoggerService.js'

const logger = createLogger('Migrate')

export async function migrate() {
    try {
        const { config } = await loadConfig()

        if (!config.database) {
            logger.info('No database configured - skipping migrations')
            return
        }

        logger.info(`Running migrations for database: ${config.database.name}`)

        const dataApi = new RDSDataClient({})

        async function exec(sql: string) {
            await dataApi.send(new ExecuteStatementCommand({
                resourceArn: COMMON_CLUSTER_ARN,
                secretArn: COMMON_SECRET_ARN,
                database: config.database!.name,
                sql
            }))
        }

        logger.info('Ensuring migrations table exists...')
        await exec(`
            CREATE TABLE IF NOT EXISTS _migrations (
              id TEXT PRIMARY KEY,
              run_at TIMESTAMP DEFAULT now()
            );
        `)

        const migrationsPath = config.database.migrationsPath || './migrations'
        const migrationsDir = path.resolve(migrationsPath)

        if (!await fs.pathExists(migrationsDir)) {
            logger.error(`No migrations directory found at: ${migrationsDir}`)
            logger.error('Create migrations directory and add .sql files')
            return
        }

        const files = (await readdir(migrationsDir))
            .filter(f => f.endsWith('.sql'))
            .sort()

        if (files.length === 0) {
            logger.error('No migration files found')
            return
        }

        logger.info(`Found ${files.length} migration files`)

        let ranCount = 0
        for (const file of files) {
            const id = path.basename(file)

            const { records } = await dataApi.send(new ExecuteStatementCommand({
                resourceArn: COMMON_CLUSTER_ARN,
                secretArn: COMMON_SECRET_ARN,
                database: config.database.name,
                sql: `SELECT 1 FROM _migrations WHERE id = :id`,
                parameters: [{ name: 'id', value: { stringValue: id } }]
            }))

            if (records && records.length) {
                logger.info(`Skipping ${id} (already run)`)
                continue
            }

            logger.info(`Running ${id}...`)
            const sql = await readFile(path.join(migrationsDir, file), 'utf-8')

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