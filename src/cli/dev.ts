import path from 'path'
import { spawn } from 'child_process'
import { createLogger } from '../services/LoggerService.js'

const logger = createLogger('Dev')

export async function dev() {
    const devScript = path.resolve('../src/dev/server.ts')

    const proc = spawn('tsx', [devScript], {
        stdio: 'inherit',
        env: {
            ...process.env,
            SDK_DEV_MODE: '1',
        }
    })

    proc.on('exit', (code) => {
        if (code !== 0) {
            logger.error(`Dev server exited with code ${code}`)
        }
    })
}
