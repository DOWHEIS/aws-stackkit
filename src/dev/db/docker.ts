import { spawn } from 'child_process'
import { PathResolver } from "../../internal/PathResolver.js"
import { logger } from '../../services/Logger.js'

const paths = new PathResolver(import.meta.url)

const COMPOSE_FILE = paths.relative('./docker-compose.yml', import.meta.url)

export async function launchDockerPostgres(): Promise<void> {
    return new Promise((resolve, reject) => {
        const up = spawn('docker', ['compose', '-f', COMPOSE_FILE, 'up', '-d'], {
            stdio: 'inherit',
        })

        up.on('exit', (code) => {
            if (code === 0) {
                logger.success('Docker Compose launched Postgres.')
                waitForHealthyContainer(resolve, reject)
            } else {
                logger.error('Failed to launch docker-compose')
                reject(new Error('Failed to launch docker-compose'))
            }
        })
    })
}

function waitForHealthyContainer(resolve: () => void, reject: (err: Error) => void) {
    const check = spawn('docker', ['inspect', '--format', '{{.State.Health.Status}}', 'sdk_dev_pg'])

    let output = ''
    check.stdout?.on('data', (data) => {
        output += data.toString()
    })

    check.on('close', () => {
        if (output.trim() === 'healthy') {
            logger.success('Postgres is healthy and ready.')
            resolve()
        } else {
            logger.info('Waiting for container to become healthy...')
            setTimeout(() => waitForHealthyContainer(resolve, reject), 1000)
        }
    })

    check.stderr?.on('data', (data) => {
        logger.error('Error checking container health:', data.toString())
        reject(new Error('Error checking container health: ' + data.toString()))
    })
}

export async function stopDockerPostgres(): Promise<void> {
    return new Promise((resolve) => {
        const down = spawn('docker', ['compose', '-f', COMPOSE_FILE, 'down'], {
            stdio: 'inherit',
        })

        down.on('exit', () => {
            logger.info('Docker Compose stopped Postgres.')
            resolve()
        })
    })
}
