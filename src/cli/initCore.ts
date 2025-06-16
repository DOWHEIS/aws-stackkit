import path from 'path'
import { fileURLToPath } from 'url'
import { existsSync } from 'fs'
import { runCommand } from '../internal/runCommand.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export async function initCore() {
    console.log('Deploying core infrastructure...')

    const coreInfraDir = path.resolve(__dirname, '..', 'core-infra')
    const cdkPath = path.join(coreInfraDir, 'node_modules', '.bin', 'cdk')

    if (!existsSync(cdkPath)) {
        console.log(`CDK binary not found at: ${cdkPath}`)
        console.log('Running npm install in core-infra directory...')

        try {
            await runCommand('npm', ['install'], coreInfraDir)
            console.log('npm install completed successfully')

            if (!existsSync(cdkPath)) {
                console.error(`CDK binary still not found after npm install at: ${cdkPath}`)
                console.error('Make sure CDK is listed as a dependency in core-infra/package.json')
                process.exit(1)
            }
        } catch (err) {
            console.error('Failed to run npm install:', err instanceof Error ? err.message : String(err))
            process.exit(1)
        }
    }

    try {
        await runCommand(cdkPath, ['deploy'], coreInfraDir)
        console.log('Core infrastructure deployed.')
    } catch (err) {
        console.error('Core infrastructure deployment failed:', err instanceof Error ? err.message : String(err))
        process.exit(1)
    }
}