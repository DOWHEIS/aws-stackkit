type LogLevel = 'silent' | 'error' | 'warn' | 'info' | 'log' | 'success';

const LEVEL_ORDER: Record<LogLevel, number> = {
    silent: 0,
    error: 1,
    warn: 2,
    info: 3,
    log: 4,
    success: 5,
};

const ansi = {
    reset: "\x1b[0m",
    bold: "\x1b[1m",
    gray: "\x1b[90m",
    cyan: "\x1b[36m",
    yellow: "\x1b[33m",
    red: "\x1b[31m",
    green: "\x1b[32m",
    white: "\x1b[37m",
    brightWhite: "\x1b[97m",
    brightGreen: "\x1b[92m",
    magenta: "\x1b[35m",
    blue: "\x1b[34m",
    brightBlue: "\x1b[94m",
};


function color(str: string, code: string, enabled: boolean) {
    return enabled ? code + str + ansi.reset : str;
}

export class Logger {
    private logLevel: LogLevel = 'log';
    private useColors: boolean = true;
    private silent: boolean = false;

    setLevel(level: LogLevel) {
        this.logLevel = level;
    }

    enableColors(use: boolean) {
        this.useColors = use;
    }

    setSilent(silent: boolean) {
        this.silent = silent;
    }

    private canLog(level: LogLevel): boolean {
        if (this.silent) return false;
        return LEVEL_ORDER[level] <= LEVEL_ORDER[this.logLevel];
    }

    log(message: string, ...args: any[]) {
        if (!this.canLog('log')) return;
        this._print(color(message, ansi.gray, this.useColors), ...args);
    }

    info(message: string, ...args: any[]) {
        if (!this.canLog('info')) return;
        this._print(color(message, ansi.cyan, this.useColors), ...args);
    }

    warn(message: string, ...args: any[]) {
        if (!this.canLog('warn')) return;
        const out = `[WARN] ${message}`;
        this._print(color(out, ansi.yellow, this.useColors), ...args);
    }

    error(message: string, ...args: any[]) {
        if (!this.canLog('error')) return;
        const out = `[ERROR] ${message}`;
        this._print(color(out, ansi.red + ansi.bold, this.useColors), ...args);
        for (const arg of args) {
            if (arg instanceof Error) {
                const stack = arg.stack || arg.toString();
                this._print(color(stack, ansi.red, this.useColors));
            }
        }
    }

    success(message: string, ...args: any[]) {
        if (!this.canLog('success')) return;
        const out = `[OK] ${message}`;
        this._print(color(out, ansi.green, this.useColors), ...args);
    }

    section(title: string) {
        const line = '='.repeat(title.length + 8);
        const output = `\n${line}\n   ${title}\n${line}\n`;
        this._print(color(output, ansi.brightWhite + ansi.bold, this.useColors));
    }

    banner(message: string) {
        const width = Math.max(message.length + 8, 30);
        const border = '='.repeat(width);
        const pad = Math.floor((width - message.length) / 2);
        const output = `\n${border}\n${' '.repeat(pad)}${message}\n${border}\n`;
        this._print(color(output, ansi.brightGreen + ansi.bold, this.useColors));
    }

    substep(message: string, ...args: any[]) {
        const output = `  • ${message}`;
        this._print(color(output, ansi.white, this.useColors), ...args);
    }

    async duration<T>(label: string, fn: () => Promise<T> | T): Promise<T> {
        const start = Date.now();
        this.substep(`${label}...`);
        const res = await Promise.resolve(fn());
        const ms = Date.now() - start;
        this.substep(`${label} finished in ${ms}ms`);
        return res;
    }

    private _print(message: string, ...args: any[]) {
        if (this.silent) return;
        console.log(message, ...args);
    }

}

export const logger = new Logger();
