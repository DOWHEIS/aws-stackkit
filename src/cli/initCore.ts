import path from 'path'
import { fileURLToPath } from 'url'
import { existsSync } from 'fs'
import { runCommand } from '../internal/runCommand.js'
import { createLogger } from '../services/LoggerService.js'

const logger = createLogger('InitCore')

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export async function initCore() {
    logger.info('Deploying core infrastructure...')

    const coreInfraDir = path.resolve(__dirname, '..', 'core-infra')
    const cdkPath = path.join(coreInfraDir, 'node_modules', '.bin', 'cdk')

    if (!existsSync(cdkPath)) {
        logger.warn(`CDK binary not found at: ${cdkPath}`)
        logger.info('Running npm install in core-infra directory...')

        try {
            await runCommand('npm', ['install'], coreInfraDir)
            logger.success('npm install completed successfully')

            if (!existsSync(cdkPath)) {
                logger.error(`CDK binary still not found after npm install at: ${cdkPath}`)
                logger.error('Make sure CDK is listed as a dependency in core-infra/package.json')
                process.exit(1)
            }
        } catch (err) {
            logger.error('Failed to run npm install:', err instanceof Error ? err.message : String(err))
            process.exit(1)
        }
    }

    try {
        await runCommand(cdkPath, ['deploy'], coreInfraDir)
        logger.success('Core infrastructure deployed.')
    } catch (err) {
        logger.error('Core infrastructure deployment failed:', err instanceof Error ? err.message : String(err))
        process.exit(1)
    }
}