import path from 'path'
import fs from 'fs-extra'
import { loadConfig } from '../internal/loadConfig.js'
import { runCommand } from '../internal/runCommand.js'
import {
    writeLastDeployedConfig,
    readLastDeployedConfig
} from '../internal/sdkmeta.js'

function hasDestructiveChanges(current: any, previous: any): boolean {
    return (
        current.database?.name &&
        previous?.database?.name &&
        current.database.name !== previous.database.name
    )
}

export async function deploy({ force = false } = {}) {
    try {
        const { config: currentConfig } = await loadConfig()

        const previousConfig = await readLastDeployedConfig()
        if (!force && hasDestructiveChanges(currentConfig, previousConfig)) {
            console.error('\nDatabase name changed!')
            console.error('This may create a new DB inside the shared cluster.\n')
            console.error('To continue anyway, run with --force.\n')
            process.exit(1)
        }

        const cdkDir = path.resolve('cdk')
        if (!await fs.pathExists(cdkDir)) {
            console.error('CDK directory not found')
            console.error('Run scaffold first to generate CDK files')
            process.exit(1)
        }

        console.log('Deploying CDK stack...')

        try {
            await runCommand('npx', ['cdk', 'deploy'], cdkDir)

            const stackName = currentConfig.name.replace(/\s+/g, '') + 'Stack'
            await writeLastDeployedConfig(currentConfig, stackName)
            console.log(`\nSuccessfully deployed ${stackName} and saved metadata.`)

            console.log('\nDeployment complete!')
            if (currentConfig.database) {
                console.log('Don\'t forget to run migrations: npx api-sdk migrate')
            }
        } catch (err) {
            console.error('\nDeployment failed:', err instanceof Error ? err.message : String(err))
            process.exit(1)
        }

    } catch (error) {
        console.error('Deploy command failed:', error instanceof Error ? error.message : String(error))
        process.exit(1)
    }
}