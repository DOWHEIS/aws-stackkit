import { Client } from 'pg'
import fs from 'fs/promises'
import path from 'path'
import type { DatabaseConfig } from '../../api/types.js'

export async function runMigrations(config: DatabaseConfig) {
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
        console.error('Failed to connect to Postgres:', err)
        throw err
    }

    await client.query(`
        CREATE TABLE IF NOT EXISTS _migrations (
                                                   id TEXT PRIMARY KEY,
                                                   run_at TIMESTAMP DEFAULT now()
            )
    `)

    const files = await fs.readdir(path.resolve(config.migrationsPath))
    const sqlFiles = files.filter(f => f.endsWith('.sql'))

    for (const file of sqlFiles) {
        const already = await client.query(
            `SELECT 1 FROM _migrations WHERE id = $1`,
            [file]
        )
        if (already.rowCount) {
            console.log(`Migration already run: ${file}`)
            continue
        }

        const content = await fs.readFile(path.join(config.migrationsPath, file), 'utf-8')
        await client.query(content)
        await client.query(`INSERT INTO _migrations (id) VALUES ($1)`, [file])
        console.log(`Ran migration: ${file}`)
    }

    await client.end()
}
