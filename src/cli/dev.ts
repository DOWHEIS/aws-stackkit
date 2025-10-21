import path from 'path'
import { fileURLToPath } from 'url'
import { spawn } from 'child_process'
import chokidar from 'chokidar'
import { scaffoldDev } from '../internal/scaffoldDev.js'
import { HmrIpcClient } from "../dev/HmrIPCHandler.js"
import { scaffold } from "./scaffold.js"
import { PathResolver } from "../internal/PathResolver.js"
import { logger } from '../services/Logger.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const cwd = process.cwd()
const paths = new PathResolver(import.meta.url)

export async function dev() {
    const cdkDevDir = paths.user('.cdk_dev')
    await scaffold(cdkDevDir)

    const devScript = path.resolve(__dirname, '../dev/server.js')
    const serverProcess = spawn('tsx', [devScript], {
        stdio: 'inherit',
        env: { ...process.env, SDK_DEV_SERVER: '1' },
        detached: false,
    })

    const ipc = new HmrIpcClient()

    setTimeout(async () => {
        try { await ipc.connect() } catch (err) {
            logger.error('[HMR] Failed to connect to dev server:', err)
        }
    }, 2000)

    const changedFiles = new Set<string>()
    let debounce: NodeJS.Timeout | null = null
    let isScaffolding = false
    let isShuttingDown = false

    const watcher = chokidar.watch([
        '**/*.ts',
        '**/*.sql',
    ], {
        ignored: [
            '**/node_modules/**',
            '**/.cdk_dev/**',
            '**/cdk/**',
            '**/.git/**',
            '**/.idea/**',
            '**/.vscode/**',
            '**/dist/**',
            '**/build/**',
            '**/out/**',
            '**/tmp/**',
            '**/pgdata/**',
            '**/*.log',
            '**/.DS_Store',
            '**/.sdk-dev-ports.json',
        ],
        ignoreInitial: true,
        awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 100 },
        persistent: true,
        followSymlinks: false,
        ignorePermissionErrors: true,
    })

    watcher.on('ready', () => {
        const watched = watcher.getWatched()
        logger.info(`[WATCHER] Watching ${Object.keys(watched).length} directories`)
    })

    watcher.on('error', (error) => {
        logger.error('[WATCHER] Chokidar error:', error)
    })

    watcher.on('all', (_event, filePath) => {
        logger.info(`[WATCHER EVENT] ${_event}: ${filePath}`)
        if (isShuttingDown) return
        changedFiles.add(filePath)
        if (debounce) clearTimeout(debounce)
        debounce = setTimeout(async () => {
            if (isScaffolding || isShuttingDown) return
            const files = Array.from(changedFiles)
            changedFiles.clear()
            logger.info(`[watch] Change detected: ${files.length} file(s)`)
            files.forEach(f => logger.substep(f))
            isScaffolding = true
            try {
                await scaffoldDev(cdkDevDir)
                await new Promise(r => setTimeout(r, 100))
                ipc.sendReload(files)
            } catch (err) {
                logger.error('Scaffold failed:', err)
            } finally {
                isScaffolding = false
            }
        }, 500)
    })

    const cleanup = async () => {
            if (isShuttingDown) return
            isShuttingDown = true
            logger.section('Shutting down dev environment...')

            if (debounce) { clearTimeout(debounce); debounce = null }

            logger.info('Disconnecting IPC...')
            ipc.disconnect()

            logger.info('Closing file watcher...')
            await watcher.close()

            if (serverProcess && !serverProcess.killed) {
                logger.info('Stopping dev server...')
                serverProcess.kill('SIGTERM')
                const killTimeout = setTimeout(() => {
                    if (serverProcess && !serverProcess.killed) {
                        logger.warn('Force killing server process...')
                        serverProcess.kill('SIGKILL')
                    }
                }, 3000)
                await new Promise<void>((resolve) => {
                    if (!serverProcess || serverProcess.killed) { clearTimeout(killTimeout); resolve(); return }
                    serverProcess.once('exit', () => { clearTimeout(killTimeout); resolve() })
                })
            }

            logger.success('Dev environment stopped')
            process.exit(0)
        }

    ;['SIGINT','SIGTERM','SIGHUP'].forEach(signal => {
        process.once(signal, async () => {
            logger.info(`\nReceived ${signal}`)
            await cleanup()
        })
    })

    serverProcess.on('exit', (code, signal) => {
        if (!isShuttingDown) {
            logger.warn(`Server process exited unexpectedly (code: ${code}, signal: ${signal})`)
            cleanup()
        }
    })
    serverProcess.on('error', (err) => {
        logger.error('Server process error:', err)
        cleanup()
    })
}
