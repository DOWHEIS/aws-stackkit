import { Client } from 'pg'
import fs from 'fs-extra'
import path from 'path'
import type { DatabaseConfig } from '../../api/types.js'
import { PathResolver } from '../../internal/PathResolver.js'
import { logger } from '../../services/Logger.js'

const DEFAULT_MIGRATION_PATHS = [
    './migrations',
    './src/migrations',
    './database/migrations'
]

export async function runMigrations(config: DatabaseConfig) {
    const paths = new PathResolver(import.meta.url)

    const client = new Client({
        host: 'localhost',
        port: 5432,
        user: 'postgres',
        password: 'postgres',
        database: 'dev',
    })

    try {
        await client.connect()
    } catch (err) {
        logger.error('Failed to connect to Postgres:', err)
        throw err
    }

    await client.query(`
        CREATE TABLE IF NOT EXISTS _migrations (
                                                   id TEXT PRIMARY KEY,
                                                   run_at TIMESTAMP DEFAULT now()
            )
    `)

    let migrationsPath: string

    if (config.migrationsPath) {
        migrationsPath = paths.resolve(config.migrationsPath)
    } else {
        const foundPath = DEFAULT_MIGRATION_PATHS.find(p =>
            fs.existsSync(paths.user(p))
        )

        if (!foundPath) {
            logger.info('[dev] No migrations directory found in default locations')
            await client.end()
            return
        }

        migrationsPath = paths.user(foundPath)
        logger.info(`[dev] Auto-discovered migrations in: ${paths.toRelative(migrationsPath)}`)
    }

    if (!await fs.pathExists(migrationsPath)) {
        logger.info(`[dev] Migrations directory not found: ${paths.toRelative(migrationsPath)}`)
        await client.end()
        return
    }

    const files = await fs.readdir(migrationsPath)
    const sqlFiles = files
        .filter(f => f.endsWith('.sql'))
        .sort()

    if (sqlFiles.length === 0) {
        logger.info('[dev] No migration files found')
        await client.end()
        return
    }

    for (const file of sqlFiles) {
        const already = await client.query(
            `SELECT 1 FROM _migrations WHERE id = $1`,
            [file]
        )
        if (already.rowCount) {
            logger.info(`Migration already run: ${file}`)
            continue
        }

        const fullContent = await fs.readFile(path.join(migrationsPath, file), 'utf-8')

        //split on @@rollback to only run the "up" part
        const [upContent] = fullContent.split('@@rollback')
        const content = upContent.trim()

        if (!content) {
            logger.warn(`Migration ${file} is empty, skipping`)
            continue
        }

        try {
            await client.query(content)
            await client.query(`INSERT INTO _migrations (id) VALUES ($1)`, [file])
            logger.success(`Ran migration: ${file}`)
        } catch (err) {
            logger.error(`Failed to run migration ${file}:`, err)
            await client.end()
            throw err
        }
    }

    await client.end()
}
