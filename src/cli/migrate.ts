import path from 'path'
import fs from 'fs-extra'
import { readdir, readFile } from 'fs/promises'
import { RDSDataClient, ExecuteStatementCommand } from '@aws-sdk/client-rds-data'
import { loadConfig } from '../internal/loadConfig.js'
import {
    COMMON_CLUSTER_ARN,
    COMMON_SECRET_ARN
} from '../helpers/globalConfig.js'

export async function migrate() {
    try {
        const { config } = await loadConfig()

        if (!config.database) {
            console.log('No database configured - skipping migrations')
            return
        }

        console.log(`Running migrations for database: ${config.database.name}`)

        const dataApi = new RDSDataClient({})

        async function exec(sql: string) {
            await dataApi.send(new ExecuteStatementCommand({
                resourceArn: COMMON_CLUSTER_ARN,
                secretArn: COMMON_SECRET_ARN,
                database: config.database!.name,
                sql
            }))
        }

        console.log('Ensuring migrations table exists...')
        await exec(`
            CREATE TABLE IF NOT EXISTS _migrations (
              id TEXT PRIMARY KEY,
              run_at TIMESTAMP DEFAULT now()
            );
        `)

        const migrationsPath = config.database.migrationsPath || './migrations'
        const migrationsDir = path.resolve(migrationsPath)

        if (!await fs.pathExists(migrationsDir)) {
            console.log(`No migrations directory found at: ${migrationsDir}`)
            console.log('Create migrations directory and add .sql files')
            return
        }

        const files = (await readdir(migrationsDir))
            .filter(f => f.endsWith('.sql'))
            .sort() // Run in alphabetical order

        if (files.length === 0) {
            console.log('No migration files found')
            return
        }

        console.log(`Found ${files.length} migration files`)

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
                console.log(`Skipping ${id} (already run)`)
                continue
            }

            console.log(`Running ${id}...`)
            const sql = await readFile(path.join(migrationsDir, file), 'utf-8')

            try {
                await exec(sql)
                await exec(`INSERT INTO _migrations (id) VALUES ('${id}')`)
                console.log(`Completed ${id}`)
                ranCount++
            } catch (error) {
                console.error(`Failed to run ${id}:`, error)
                process.exit(1)
            }
        }

        if (ranCount === 0) {
            console.log('All migrations are up to date')
        } else {
            console.log(`Successfully ran ${ranCount} migration(s)`)
        }

    } catch (error) {
        console.error('Migration failed:', error)
        process.exit(1)
    }
}