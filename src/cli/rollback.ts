import path from 'path'
import fs from 'fs-extra'
import { readLastDeployedConfig } from '../internal/sdkmeta.js'
import { ApiDefinition } from '../models/ApiDefinition.js'
import { ApiBuilder } from '../core/ApiBuilder.js'
import { formatCdk } from '../internal/format.js'

export async function rollback() {
    try {
        const lastConfig = await readLastDeployedConfig()

        if (!lastConfig) {
            console.error('No last-deployed config found.')
            console.error('Deploy at least once before using rollback')
            process.exit(1)
        }

        console.log('Rebuilding CDK files from last-deployed config...')
        console.log(`Rolling back to: ${lastConfig.name}`)

        const apiDefinition = ApiDefinition.from(lastConfig)

        const cdkDir = path.resolve('cdk')
        console.log(`Cleaning CDK directory: ${cdkDir}`)
        await fs.remove(cdkDir)
        await fs.ensureDir(cdkDir)

        const builder = ApiBuilder.from(apiDefinition)
        await builder.generate(cdkDir)

        console.log('Formatting generated code...')
        await formatCdk()

        console.log('Rollback complete!')
        console.log('CDK files restored from last-deployed config')
        console.log('Run "npm install" in the cdk directory if needed')

    } catch (error) {
        console.error('Rollback failed:', error)
        process.exit(1)
    }
}