import path from 'path'
import fs from 'fs-extra'
import { readFile } from 'fs/promises'
import { RDSDataClient, ExecuteStatementCommand } from '@aws-sdk/client-rds-data'
import { loadConfig } from '../internal/loadConfig.js'
import { PathResolver } from '../internal/PathResolver.js'
import { logger } from '../services/Logger.js'
import {GetParameterCommand, SSMClient} from "@aws-sdk/client-ssm";

const DEFAULT_MIGRATION_PATHS = [
    './migrations',
    './src/migrations',
    './database/migrations'
]

const ssm = new SSMClient({});

async function getParameter(name: string, withDecryption = false) {
    const command = new GetParameterCommand({
        Name: name,
        WithDecryption: withDecryption
    });
    const { Parameter } = await ssm.send(command);
    return Parameter?.Value;
}

export async function migrateRollback(options: { steps?: string }) {
    try {
        const paths = new PathResolver(import.meta.url)
        const { apiDefinition } = await loadConfig()

        if (!apiDefinition.database) {
            logger.error('No database configured')
            process.exit(1)
        }

        const steps = options.steps ? parseInt(options.steps, 10) : 1
        if (isNaN(steps) || steps < 1) {
            logger.error('Invalid steps value. Must be a positive number.')
            process.exit(1)
        }

        logger.section(`Rolling back ${steps} migration(s) for database: ${apiDefinition.database.name}`)

        const COMMON_CLUSTER_ARN = await getParameter('/core-stackkit-infra/db-cluster-arn');
        const COMMON_SECRET_ARN = await getParameter('/core-stackkit-infra/db-secret-arn');

        const dataApi = new RDSDataClient({})

        async function exec(sql: string) {
            await dataApi.send(new ExecuteStatementCommand({
                resourceArn: COMMON_CLUSTER_ARN,
                secretArn: COMMON_SECRET_ARN,
                database: apiDefinition.database!.name,
                sql
            }))
        }

        const { records } = await dataApi.send(new ExecuteStatementCommand({
            resourceArn: COMMON_CLUSTER_ARN,
            secretArn: COMMON_SECRET_ARN,
            database: apiDefinition.database.name,
            sql: `SELECT id FROM _migrations ORDER BY run_at DESC LIMIT :limit`,
            parameters: [{ name: 'limit', value: { longValue: steps } }]
        }))

        if (!records || records.length === 0) {
            logger.info('No migrations to rollback')
            return
        }

        const migrationsToRollback = records.map(r => r[0].stringValue!).reverse()

        logger.info(`Will rollback ${migrationsToRollback.length} migration(s):`)
        migrationsToRollback.forEach(m => logger.substep(m))

        let migrationsDir: string

        if (apiDefinition.database.migrationsPath) {
            migrationsDir = paths.resolve(apiDefinition.database.migrationsPath)
        } else {
            const foundPath = DEFAULT_MIGRATION_PATHS.find(p =>
                fs.existsSync(paths.user(p))
            )

            if (!foundPath) {
                logger.error('No migrations directory found')
                process.exit(1)
            }

            migrationsDir = paths.user(foundPath)
        }

        logger.warn('\nThis will rollback the above migrations. This action cannot be undone.')
        const readline = await import('readline')
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        })

        const answer = await new Promise<string>((resolve) => {
            rl.question('Continue? (yes/no): ', resolve)
        })
        rl.close()

        if (answer.toLowerCase() !== 'yes') {
            logger.info('Rollback cancelled')
            return
        }

        let rolledBackCount = 0
        for (const migrationId of migrationsToRollback) {
            const filePath = path.join(migrationsDir, migrationId)

            if (!await fs.pathExists(filePath)) {
                logger.error(`Migration file not found: ${migrationId}`)
                logger.warn('Cannot rollback without migration file')
                process.exit(1)
            }

            const fullContent = await readFile(filePath, 'utf-8')
            const parts = fullContent.split('@@rollback')

            if (parts.length < 2 || !parts[1].trim()) {
                logger.error(`No rollback SQL found in ${migrationId}`)
                logger.info('Add rollback SQL after @@rollback marker in the migration file')
                process.exit(1)
            }

            const rollbackSql = parts[1].trim()

            logger.substep(`Rolling back ${migrationId}...`)

            try {
                await exec(rollbackSql)
                await exec(`DELETE FROM _migrations WHERE id = '${migrationId}'`)
                logger.success(`Rolled back ${migrationId}`)
                rolledBackCount++
            } catch (error) {
                logger.error(`Failed to rollback ${migrationId}:`, error)
                logger.warn(`Partially rolled back ${rolledBackCount} of ${migrationsToRollback.length} migrations`)
                process.exit(1)
            }
        }

        logger.success(`Successfully rolled back ${rolledBackCount} migration(s)`)

    } catch (error) {
        logger.error('Rollback failed:', error)
        process.exit(1)
    }
}
