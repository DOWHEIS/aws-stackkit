import path from 'path'
import fs from 'fs-extra'
import { ApiBuilder } from '../core/ApiBuilder.js'
import { loadConfig } from '../internal/loadConfig.js'
import { runCommand } from '../internal/runCommand.js'
import { formatCdk } from '../internal/format.js'
import { logger } from '../services/Logger.js'
import {PathResolver} from "../internal/PathResolver.js";

const paths = new PathResolver(import.meta.url)

export async function scaffold(outputDir: string = 'cdk'): Promise<void> {
    try {
        logger.section('Loading api.config.ts...')
        const { apiDefinition } = await loadConfig();
        logger.success(`Loaded config for "${apiDefinition.name}"`);

        await fs.ensureDir(outputDir);

        const builder = new ApiBuilder(apiDefinition);
        await builder.generate(outputDir);

        const cdkDir = path.resolve(process.cwd(), outputDir);
        logger.info(`Installing npm dependencies in ${cdkDir}...`);
        await logger.duration('npm install', async () => {
            await runCommand('npm', ['install'], cdkDir);
        });
        logger.success('Dependencies installed successfully.');

        logger.info('Formatting generated code with Prettier...');
        await logger.duration('format', async () => {
            const cdkDevDir = paths.user('.cdk_dev')

            const isDev = outputDir === cdkDevDir;
            await formatCdk(isDev, import.meta.url);
        });
        logger.success('Code formatted.');

    } catch (error) {
        logger.error('Scaffolding failed:', error);

        if (error instanceof Error) {
            logger.error('Stack trace:', error.stack);
        }

        process.exit(1);
    }
}
