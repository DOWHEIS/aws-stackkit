export enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3,
    SILENT = 4
}

export interface LoggerOptions {
    level?: LogLevel
    prefix?: string
    colors?: boolean
}

export class LoggerService {
    private level: LogLevel
    private prefix: string
    private colors: boolean

    constructor(options: LoggerOptions = {}) {
        this.level = options.level ?? LogLevel.INFO
        this.prefix = options.prefix ?? ''
        this.colors = options.colors ?? true
    }

    static create(prefix?: string, level?: LogLevel): LoggerService {
        return new LoggerService({ prefix, level })
    }

    debug(message: string, ...args: any[]): void {
        this.log(LogLevel.DEBUG, message, ...args)
    }

    info(message: string, ...args: any[]): void {
        this.log(LogLevel.INFO, message, ...args)
    }

    warn(message: string, ...args: any[]): void {
        this.log(LogLevel.WARN, message, ...args)
    }

    error(message: string, ...args: any[]): void {
        this.log(LogLevel.ERROR, message, ...args)
    }

    success(message: string, ...args: any[]): void {
        this.logWithColor(LogLevel.INFO, '\u001b[32m', message, ...args)
    }

    private log(level: LogLevel, message: string, ...args: any[]): void {
        if (this.level > level) return

        const formattedMessage = this.formatMessage(level, message)

        switch (level) {
            case LogLevel.ERROR:
                console.error(formattedMessage, ...args)
                break
            case LogLevel.WARN:
                console.warn(formattedMessage, ...args)
                break
            default:
                console.log(formattedMessage, ...args)
        }
    }

    private logWithColor(level: LogLevel, color: string, message: string, ...args: any[]): void {
        if (this.level > level) return

        const coloredMessage = this.colors
            ? `${color}${this.formatMessage(level, message)}\u001b[0m`
            : this.formatMessage(level, message)

        console.log(coloredMessage, ...args)
    }

    private formatMessage(level: LogLevel, message: string): string {
        const prefix = this.prefix ? `[${this.prefix}] ` : ''
        return `${prefix}${message}`
    }

    setLevel(level: LogLevel): void {
        this.level = level
    }

    createChild(childPrefix: string): LoggerService {
        const fullPrefix = this.prefix
            ? `${this.prefix}:${childPrefix}`
            : childPrefix

        return new LoggerService({
            level: this.level,
            prefix: fullPrefix,
            colors: this.colors
        })
    }
}

export function createLogger(prefix: string, level?: LogLevel): LoggerService {
    return LoggerService.create(prefix, level)
}