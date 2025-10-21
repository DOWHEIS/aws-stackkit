import fs from "fs/promises";
import { PathResolver } from "../internal/PathResolver.js";
import { pathToFileURL } from "url";
import path from "path";
import { createRequire } from "module";
import { logger } from "../services/Logger.js";

const cjsRequire = createRequire(import.meta.url);

export class IsolatedModuleLoader {
    private paths = new PathResolver(import.meta.url);
    private moduleTimestamps = new Map<string, number>();
    private loadingLock = new Map<string, Promise<any>>();

    async loadHandler(lambdaPath: string): Promise<(...a: any[]) => Promise<any>> {
        const absPath = this.paths.resolve(lambdaPath);

        if (this.loadingLock.has(absPath)) {
            logger.info(`[Module Loader] Waiting for concurrent load of ${path.basename(absPath)}`)
            return this.loadingLock.get(absPath)!
        }

        const loadPromise = this._loadHandler(absPath)
        this.loadingLock.set(absPath, loadPromise)

        try {
            return await loadPromise
        } finally {
            this.loadingLock.delete(absPath)
        }
    }

    private async _loadHandler(absPath: string): Promise<(...a: any[]) => Promise<any>> {
        this.clearModuleCache(absPath);

        const timestamp = this.moduleTimestamps.get(absPath) || Date.now();
        const url = pathToFileURL(absPath).href + `?t=${timestamp}`;

        logger.info(`[Module Loader] Importing ${path.basename(absPath)}`)

        const handlerMod = await this.importWithRetry(url, absPath);

        const handler = handlerMod.main ?? handlerMod.default;
        if (!handler) {
            throw new Error(`No handler export (main or default) found in ${absPath}`);
        }

        logger.info(`[Module Loader] Successfully loaded ${path.basename(absPath)}`)

        return async (event: any, context: any) => {
            const result = await this.runIsolated(handler, event, context);
            return result;
        };
    }

    private async importWithRetry(url: string, absPath: string, retries = 10) {
        for (let attempt = 0; attempt <= retries; attempt++) {
            try {
                return await import(url);
            } catch (err: any) {
                if (err.code !== "ERR_MODULE_NOT_FOUND") {
                    logger.error(`[Module Loader] Import error (attempt ${attempt + 1}):`, err.message)
                    throw err
                }

                if (attempt === retries) {
                    logger.error(`[Module Loader] Module not found after ${retries} attempts: ${absPath}`)
                    throw err
                }

                logger.warn(`[Module Loader] Module not found, retrying... (${attempt + 1}/${retries})`)
                await this.waitFile(absPath, 100);
            }
        }
        throw new Error("unreachable");
    }

    private async waitFile(file: string, ms: number) {
        const start = Date.now();
        while (Date.now() - start < ms) {
            try {
                await fs.access(file);
                return;
            } catch {
                await new Promise(r => setTimeout(r, 10));
            }
        }
    }

    private async runIsolated(fn: Function, evt: any, ctx: any) {
        const originalEnv = { ...process.env };
        try   {
            return await fn(evt, ctx);
        } finally {
            process.env = originalEnv;
        }
    }

    clearCache(changed: string[]) {
        const now = Date.now();

        logger.info(`[Module Loader] Clearing cache for ${changed.length} changed files`)

        changed.forEach(f => {
            const absPath = path.resolve(f);
            this.moduleTimestamps.set(absPath, now);
            this.clearModuleCache(absPath);
        });

        const wrappedDir = this.paths.user('.cdk_dev/wrapped');
        for (const [modulePath] of this.moduleTimestamps) {
            if (modulePath.includes(wrappedDir)) {
                this.moduleTimestamps.set(modulePath, now);
            }
        }

        this.loadingLock.clear()

        logger.success("[Module Loader] Cache cleared for hot reload");
    }

    private clearModuleCache(modulePath: string) {
        const absDir = path.dirname(modulePath);
        for (const key of Object.keys(cjsRequire.cache)) {
            if (key === modulePath || key.startsWith(absDir + path.sep)) {
                delete cjsRequire.cache[key];
            }
        }
    }
}
