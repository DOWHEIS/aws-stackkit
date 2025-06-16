import path from 'path'
import fs from 'fs-extra'
import { ApiBuilder } from '../core/ApiBuilder.js'
import { loadConfig } from '../internal/loadConfig.js'
import { runCommand } from '../internal/runCommand.js'
import { formatCdk } from '../internal/format.js'

export async function scaffold(outputDir: string = 'cdk-refactors'): Promise<void> {
    try {
        console.log('Loading api.config.ts...')
        const { config, apiDefinition } = await loadConfig()
        console.log(`Loaded config for "${config.name}"`)

        const builder = ApiBuilder.from(apiDefinition)
        const validation = builder.validate()
        if (!validation.valid) {
            console.error('Configuration validation failed:')
            validation.errors.forEach(error => console.error(`  • ${error}`))
            process.exit(1)
        }

        await fs.ensureDir(outputDir)

        await builder.generate(outputDir)

        const cdkDir = path.resolve(process.cwd(), outputDir)
        console.log(`Installing npm dependencies in ${cdkDir}...`)
        await runCommand('npm', ['install'], cdkDir)
        console.log('Dependencies installed successfully.')

        console.log('Formatting generated code with Prettier...')
        await formatCdk()
        console.log('Code formatted.')

    } catch (error) {
        console.error('Scaffolding failed:', error)

        if (error instanceof Error) {
            console.error('Stack trace:', error.stack)
        }

        process.exit(1)
    }
}