import path from 'path'
import fs from 'fs-extra'
import { loadConfig } from '../internal/loadConfig.js'
import { PathResolver } from '../internal/PathResolver.js'
import { logger } from '../services/Logger.js'

const DEFAULT_MIGRATION_PATHS = [
    './migrations',
    './src/migrations',
    './database/migrations'
]

export async function createMigration(name: string) {
    try {
        const paths = new PathResolver(import.meta.url)

        if (!name) {
            logger.error('Migration name is required')
            logger.info('Usage: npx api-sdk create:migration <name>')
            process.exit(1)
        }

        const sanitizedName = name
            .toLowerCase()
            .replace(/[^a-z0-9_]/g, '_')
            .replace(/_+/g, '_')

        if (!sanitizedName) {
            logger.error('Invalid migration name. Use only letters, numbers, and underscores.')
            process.exit(1)
        }

        logger.section(`Creating migration: ${sanitizedName}`)

        let migrationsPath: string | undefined
        try {
            const { apiDefinition } = await loadConfig()
            migrationsPath = apiDefinition.database?.migrationsPath

            if (!apiDefinition.database) {
                logger.warn('No database configured in api.config.ts')
                logger.info('Migration will be created, but you need to configure a database to use it')
            }
        } catch (error) {
            logger.info('No api.config.ts found, using default migration path')
        }

        let migrationDir: string
        if (migrationsPath) {
            migrationDir = paths.resolve(migrationsPath)
            logger.info(`Using configured migration path: ${paths.toRelative(migrationDir)}`)
        } else {
            const existingPath = DEFAULT_MIGRATION_PATHS.find(p =>
                fs.existsSync(paths.user(p))
            )

            if (existingPath) {
                migrationDir = paths.user(existingPath)
                logger.info(`Found existing migrations in: ${paths.toRelative(migrationDir)}`)
            } else {
                migrationDir = paths.user(DEFAULT_MIGRATION_PATHS[0])
                logger.info(`Creating new migration directory: ${paths.toRelative(migrationDir)}`)
            }
        }

        await fs.ensureDir(migrationDir)

        const existingFiles = await fs.readdir(migrationDir)
        const migrationFiles = existingFiles
            .filter(f => f.endsWith('.sql'))
            .sort()

        let nextNumber = 1
        if (migrationFiles.length > 0) {
            const lastFile = migrationFiles[migrationFiles.length - 1]
            const match = lastFile.match(/^(\d+)_/)
            if (match) {
                nextNumber = parseInt(match[1], 10) + 1
            }
        }

        const formattedNumber = nextNumber.toString().padStart(3, '0')
        const fileName = `${formattedNumber}_${sanitizedName}.sql`
        const filePath = path.join(migrationDir, fileName)

        if (await fs.pathExists(filePath)) {
            logger.error(`Migration already exists: ${fileName}`)
            process.exit(1)
        }

        const content = `-- Migration: ${fileName}
-- Created: ${new Date().toISOString()}
-- Description: ${name}

-- ========================================
-- UP MIGRATION
-- ========================================

-- Add your SQL here


-- ========================================
-- ROLLBACK (keep the @@rollback marker!)
-- ========================================
-- @@rollback

-- Add rollback SQL here (e.g., DROP TABLE, etc.)

`

        await fs.writeFile(filePath, content, 'utf-8')

        logger.success(`Created migration: ${fileName}`)
        logger.info(`Location: ${paths.toRelative(filePath)}`)
        logger.section('Next steps:')
        logger.substep('1. Edit the migration file with your SQL')
        logger.substep('2. Run "npx aws-corps-api-sdk migrate" to apply changes on prod')
        logger.substep('3. Run "npx aws-corps-api-sdk dev" to apply changes on dev, if the dev server is running, restart it to pick up the new migration')

        if (!migrationsPath && !existingFiles.length) {
            logger.warn('\nNote: Optionally configure your database in api.config.ts to include the migrations path:')
            logger.info(`
              database: {
                name: 'your_db_name',
                migrationsPath: '${DEFAULT_MIGRATION_PATHS[0]}' // optional
              }`)
        }

    } catch (error) {
        logger.error('Failed to create migration:', error)
        if (error instanceof Error) {
            logger.error(error.stack || '')
        }
        process.exit(1)
    }
}
