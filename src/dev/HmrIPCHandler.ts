import net from 'net'
import { EventEmitter } from 'events'
import { logger } from '../services/Logger.js'
import fs from 'fs-extra'
import path from 'path'

interface ReloadMessage {
    type: 'reload' | 'ping'
    files?: string[]
    timestamp: number
}

const PORT_FILE = path.join(process.cwd(), '.sdk-dev-ports.json')

export class HmrIpcServer extends EventEmitter {
    private server: net.Server
    private clients: Set<net.Socket> = new Set()
    private isRunning = false

    constructor(private port: number = 3001) {
        super()
        this.server = net.createServer(this.handleConnection.bind(this))
    }

    start() {
        if (this.isRunning) { logger.warn('[HMR] IPC server already running'); return }
        this.server.listen(this.port, () => {
            this.isRunning = true
            logger.info(`[HMR] IPC server listening on port ${this.port}`)
        })
        this.server.on('error', (err) => {
            logger.error('[HMR] IPC server error:', err)
            this.isRunning = false
        })
    }

    stop() {
        if (!this.isRunning) return
        for (const client of this.clients) client.destroy()
        this.clients.clear()
        this.server.close(() => { this.isRunning = false })
    }

    private handleConnection(socket: net.Socket) {
        logger.info('[HMR] IPC client connected')
        this.clients.add(socket)
        let buffer = ''
        socket.on('data', (data) => {
            buffer += data.toString()
            const messages = buffer.split('\n')
            buffer = messages.pop() || ''
            for (const message of messages) {
                if (!message.trim()) continue
                try {
                    const parsed = JSON.parse(message) as ReloadMessage
                    this.handleMessage(parsed)
                } catch (error) {
                    logger.error('[HMR] Invalid IPC message:', error)
                }
            }
        })
        socket.on('close', () => { this.clients.delete(socket); logger.info('[HMR] IPC client disconnected') })
        socket.on('error', (err) => { logger.warn('[HMR] IPC socket error:', err.message); this.clients.delete(socket) })
    }

    private handleMessage(message: ReloadMessage) {
        if (message.type === 'reload' && message.files) {
            logger.info(`[HMR] Reload requested for ${message.files.length} files`)
            this.emit('reload', message.files)
        }
    }
}

export class HmrIpcClient {
    private client?: net.Socket
    private connected = false
    private retryCount = 0
    private maxRetries = 10
    private retryDelay = 1000
    private actualPort?: number
    private shouldReconnect = true
    private reconnectTimer?: NodeJS.Timeout
    private isConnecting = false
    private connectPromise?: Promise<void>

    constructor(private defaultPort: number = 3001) {}

    async connect(): Promise<void> {
        if (this.isConnecting && this.connectPromise) return this.connectPromise
        if (this.connected && this.client && !this.client.destroyed) return Promise.resolve()
        this.isConnecting = true

        try {
            const portInfo = await fs.readJson(PORT_FILE)
            this.actualPort = portInfo.ipcPort || this.defaultPort
        } catch { this.actualPort = this.defaultPort }

        this.connectPromise = new Promise((resolve, reject) => {
            const attempt = () => {
                if (!this.shouldReconnect) { this.isConnecting = false; reject(new Error('Connection cancelled')); return }
                this.client = net.createConnection({ port: this.actualPort! }, () => {
                    this.connected = true
                    this.retryCount = 0
                    this.isConnecting = false
                    logger.success(`[HMR] Connected to dev server on port ${this.actualPort}`)
                    resolve()
                })
                this.client.setKeepAlive(true, 1000)
                this.client.on('error', (err: any) => {
                    if (err.code === 'ECONNREFUSED' && this.retryCount < this.maxRetries && this.shouldReconnect) {
                        this.retryCount++
                        if (this.retryCount === 1) {
                            fs.readJson(PORT_FILE).then(p => { this.actualPort = p.ipcPort || this.defaultPort }).catch(() => {})
                        }
                        logger.warn(`[HMR] Connection attempt ${this.retryCount}/${this.maxRetries}...`)
                        setTimeout(attempt, this.retryDelay)
                    } else {
                        this.isConnecting = false
                        this.connected = false
                        logger.error('[HMR] IPC connection failed:', err.message)
                        reject(err)
                    }
                })
                this.client.on('close', () => {
                    const wasConnected = this.connected
                    this.connected = false
                    if (wasConnected) logger.warn('[HMR] Connection closed')
                    if (this.shouldReconnect && !this.reconnectTimer && wasConnected && !this.isConnecting) {
                        logger.info('[HMR] Attempting to reconnect in 2s...')
                        this.reconnectTimer = setTimeout(() => {
                            this.reconnectTimer = undefined
                            this.retryCount = 0
                            this.connect().catch(err => logger.error('[HMR] Reconnection failed:', err.message))
                        }, 2000)
                    }
                })
            }
            attempt()
        })

        try { await this.connectPromise } finally { this.connectPromise = undefined }
    }

    sendReload(changedFiles: string[]) {
        if (!this.connected || !this.client || this.client.destroyed) {
            logger.warn('[HMR] Not connected to server, queueing reload...')
            return
        }
        try {
            const message: ReloadMessage = { type: 'reload', files: changedFiles, timestamp: Date.now() }
            this.client.write(JSON.stringify(message) + '\n', (err) => {
                if (err) { logger.error('[HMR] Failed to send reload signal:', err.message); this.connected = false }
                else { logger.info(`[HMR] Sent reload signal for ${changedFiles.length} files`) }
            })
        } catch (err: any) {
            logger.error('[HMR] Error sending reload:', err.message)
            this.connected = false
        }
    }

    disconnect() {
        logger.info('[HMR] Disconnecting IPC client...')
        this.shouldReconnect = false
        if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = undefined }
        if (this.client && !this.client.destroyed) { this.client.removeAllListeners(); this.client.destroy(); this.client = undefined }
        this.connected = false
        this.isConnecting = false
        this.connectPromise = undefined
    }
}
