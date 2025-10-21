import http from 'http'
import net from 'net'
import { parse } from 'url'
import { loadConfig } from '../internal/loadConfig.js'
import { emulateEvent } from './emulator.js'
import { buildRouter } from './router.js'
import { launchDockerPostgres, stopDockerPostgres } from './db/docker.js'
import { runMigrations } from './db/migrate.js'
import { HmrIpcServer } from './HmrIPCHandler.js'
import { IsolatedModuleLoader } from "./IsolatedModuleLoader.js"
import { logger } from '../services/Logger.js'
import fs from 'fs-extra'
import path from 'path'

const DEFAULT_PORT = 3000
const DEFAULT_IPC_PORT = 3001
const PORT_RANGE = 20
const PORT_FILE = path.join(process.cwd(), '.sdk-dev-ports.json')

async function isPortAvailable(port: number): Promise<boolean> {
    return new Promise((resolve) => {
        const tester = net.createServer()
            .once('error', () => resolve(false))
            .once('listening', () => { tester.once('close', () => resolve(true)).close() })
            .listen(port)
    })
}

async function findAvailablePort(start: number, range: number, exclude: Set<number> = new Set()): Promise<number> {
    for (let p = start; p < start + range; p++) {
        if (exclude.has(p)) continue
        if (await isPortAvailable(p)) return p
    }
    throw new Error(`No available ports in ${start}-${start + range - 1}`)
}

async function chooseDistinctPorts(): Promise<{ http: number; ipc: number }> {
    const http = await findAvailablePort(DEFAULT_PORT, PORT_RANGE)
    const ipc = await findAvailablePort(DEFAULT_IPC_PORT, PORT_RANGE, new Set([http]))
    if (http === ipc) throw new Error('Port selection collision')
    return { http, ipc }
}

let isShuttingDown = false
let server: http.Server | null = null
let ipcServer: HmrIpcServer | null = null
let actualPort = DEFAULT_PORT
let actualIpcPort = DEFAULT_IPC_PORT
let hasDatabase = false

async function cleanup() {
    if (isShuttingDown) return
    isShuttingDown = true
    logger.section('Shutting down dev server...')

    if (server) {
        logger.info('Closing HTTP server...')
        await Promise.race([
            new Promise<void>((resolve) => { server!.close(() => { logger.info('HTTP server closed'); resolve() }) }),
            new Promise<void>((resolve) => setTimeout(resolve, 2000))
        ])
    }

    if (ipcServer) {
        logger.info('Stopping IPC server...')
        ipcServer.stop()
    }

    if (hasDatabase) {
        logger.info('Stopping Docker Postgres...')
        try {
            await Promise.race([stopDockerPostgres(), new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 3000))])
        } catch {}
    }

    logger.success('Dev server stopped')
    process.exit(0)
}

function setupCleanupHandlers() {
    process.removeAllListeners('SIGTERM')
    process.once('SIGTERM', async () => {
        logger.info('Received shutdown signal from parent')
        await cleanup()
    })

    process.removeAllListeners('uncaughtException')
    process.once('uncaughtException', async (error) => {
        logger.error('Uncaught exception:', error)
        await cleanup()
    })

    process.removeAllListeners('unhandledRejection')
    process.once('unhandledRejection', async (reason, promise) => {
        logger.error('Unhandled rejection at:', promise, 'reason:', reason)
        await cleanup()
    })
}

async function main() {
    setupCleanupHandlers()
    logger.section('Starting dev server...')

    const ports = await chooseDistinctPorts()
    actualPort = ports.http
    actualIpcPort = ports.ipc

    await fs.writeJson(PORT_FILE, {
        port: actualPort,
        ipcPort: actualIpcPort,
        pid: process.pid,
        startTime: new Date().toISOString()
    })

    let { apiDefinition: config } = await loadConfig()
    let router = buildRouter(config)

    const moduleManager = new IsolatedModuleLoader()
    ipcServer = new HmrIpcServer(actualIpcPort)

    hasDatabase = !!config.database

    if (config.database) {
        logger.info('Launching local Postgres container...')
        await launchDockerPostgres()
        logger.info('Running database migrations...')
        await runMigrations(config.database)
    }

    ipcServer.on('reload', async (changedFiles: string[]) => {
        changedFiles.forEach(f => logger.substep(f))
        try {
            const { apiDefinition: newConfig } = await loadConfig()
            config = newConfig
            hasDatabase = !!config.database
            router = buildRouter(config)
            moduleManager.clearCache(changedFiles)
            logger.success('[HMR] Router rebuilt and cache cleared')
        } catch (err) {
            logger.error('[HMR] Failed to reload config/router:', err)
        }
    })

    ipcServer.start()

    server = http.createServer(async (req, res) => {
        const method = req.method || 'GET'
        const url = parse(req.url || '', true)

        if (url.pathname === '/health') {
            res.writeHead(200, { 'Content-Type': 'text/plain' })
            return res.end('OK')
        }

        if (req.method === 'OPTIONS') {
            const origin = req.headers.origin
            res.writeHead(204, {
                'Access-Control-Allow-Origin': origin || '*',
                'Access-Control-Allow-Headers': 'Content-Type,Authorization,Accept,X-Return-URL,X-Api-Key',
                'Access-Control-Allow-Methods': 'GET,OPTIONS,POST,PUT,DELETE',
            })
            return res.end()
        }

        const match = router.match(url.pathname || '', method)
        if (!match) { res.writeHead(404); return res.end('Not found') }

        logger.info(`${method} ${url.pathname} -> ${match.lambdaPath}`)

        const event = await emulateEvent(req, match.params, {
            domainName: `localhost:${actualPort}`,
            stage: "",
            resourcePath: match.lambdaPath || req.url
        })

        try {
            logger.info(`[Request] Loading handler...`)
            const handler = await moduleManager.loadHandler(match.lambdaPath)
            logger.info(`[Request] Executing handler...`)
            const startTime = Date.now()
            const timeoutPromise = new Promise((_, reject) => { setTimeout(() => reject(new Error('Handler timeout after 30s')), 30000) })
            const result = await Promise.race([handler(event, {}), timeoutPromise])
            const duration = Date.now() - startTime
            logger.info(`[Request] Handler completed in ${duration}ms`)

            const headers = result.headers || {}
            const origin = req.headers.origin
            if (origin && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) headers['Access-Control-Allow-Origin'] = origin
            else headers['Access-Control-Allow-Origin'] = '*'
            headers['Access-Control-Allow-Headers'] = 'Content-Type,Authorization,Accept,X-Return-URL,X-Api-Key'
            headers['Access-Control-Allow-Methods'] = 'GET,OPTIONS,POST,PUT,DELETE'
            if (!headers['content-type'] && !headers['Content-Type']) headers['Content-Type'] = 'application/json'

            res.writeHead(result.statusCode || 200, headers)
            res.end(typeof result.body === 'string' ? result.body : JSON.stringify(result.body))
        } catch (error: any) {
            logger.error(`Error running handler for ${match.lambdaPath}:`, error)
            res.writeHead(500, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: 'Internal Server Error', message: process.env.NODE_ENV === 'development' ? error.message : undefined }))
        }
    })

    server.on('error', (error: any) => {
        logger.error('Server error:', error)
        cleanup()
    })

    server.listen(actualPort, () => {
        if (actualPort !== DEFAULT_PORT) logger.warn(`Port ${DEFAULT_PORT} was busy, using port ${actualPort} instead`)
        logger.section(`Dev server listening at http://localhost:${actualPort}`)
        logger.info(`[HMR] IPC server on port ${actualIpcPort}`)
        logger.info('Debugger: Attach to localhost:9229 to debug lambda handlers')
        logger.info('WebStorm: Run > Attach to Node.js/Chrome > Port 9229')
        logger.info('VSCode: Use "Attach" launch config with port 9229')
        logger.info('Press Ctrl+C to stop')
    })
}

main().catch(async (err) => {
    logger.error('Failed to start dev server:', err)
    await cleanup()
})
