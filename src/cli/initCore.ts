import path from 'path'
import { fileURLToPath } from 'url'
import { existsSync } from 'fs'
import fs from 'fs-extra'
import { runCommand } from '../internal/runCommand.js'
import { logger } from '../services/Logger.js'
import os from 'os'
import readline from 'readline'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const DEFAULT_DIR = path.join(os.homedir(), 'core-stackkit-infra')

async function prompt(question: string, defaultValue?: string): Promise<string> {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    })
    return new Promise(resolve => {
        rl.question(
            defaultValue ? `${question} (${defaultValue}): ` : `${question}: `,
            (answer) => {
                rl.close()
                resolve(answer.trim() || defaultValue || '')
            }
        )
    })
}

async function promptConfirm(question: string, defaultValue = true): Promise<boolean> {
    const hint = defaultValue ? '[Y/n]' : '[y/N]'
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    })
    return new Promise(resolve => {
        rl.question(`${question} ${hint}: `, (answer) => {
            rl.close()
            const v = answer.trim().toLowerCase()
            if (!v) return resolve(defaultValue)
            if (['y', 'yes'].includes(v)) return resolve(true)
            if (['n', 'no'].includes(v)) return resolve(false)
            return resolve(defaultValue)
        })
    })
}

export async function initCore({ skipDeploy = false } = {}) {
    logger.section('Initialize Core Infrastructure')

    const outputDir = await prompt('Where should the core infra project be created?', DEFAULT_DIR)

    if (!existsSync(outputDir)) {
        logger.info(`Scaffolding core infra project at: ${outputDir}`)
        await fs.mkdirp(outputDir)

        await fs.copy(
            path.resolve(__dirname, '..', 'core-infra'),
            outputDir,
            { overwrite: false, errorOnExist: false }
        )
        logger.success('Core infra project scaffolded.')
    } else {
        logger.info(`Using existing core infra directory: ${outputDir}`)
    }

    const cdkPath = path.join(outputDir, 'node_modules', '.bin', 'cdk')
    if (!existsSync(cdkPath)) {
        logger.info('Running npm install in core-infra directory...')
        try {
            await logger.duration('npm install', async () => {
                await runCommand('npm', ['install'], outputDir)
            })
            logger.success('npm install completed')
        } catch (err) {
            logger.error('npm install failed:', err instanceof Error ? err.message : String(err))
            process.exit(1)
        }
    }

    if (!existsSync(path.join(outputDir, '.git'))) {
        logger.info('Initializing git repo...')
        try {
            await runCommand('git', ['init'], outputDir)
            await runCommand('git', ['add', '.'], outputDir)
            await runCommand('git', ['commit', '-m', 'Initial core infra scaffold'], outputDir)
            logger.success('Git repo initialized')
        } catch (err) {
            logger.warn('Failed to init git repo:', err instanceof Error ? err.message : String(err))
        }
    }

    let doDeploy = !skipDeploy
    if (!skipDeploy) {
        doDeploy = await promptConfirm('Do you want to deploy core infra now?', true)
    }

    if (doDeploy) {
        try {
            await logger.duration('cdk deploy', async () => {
                await runCommand(path.join(outputDir, 'node_modules', '.bin', 'cdk'), ['deploy'], outputDir)
            })
            logger.success('Core infrastructure deployed.')
        } catch (err) {
            logger.error('Core infrastructure deployment failed:', err instanceof Error ? err.message : String(err))
            process.exit(1)
        }
    } else {
        logger.info('You can deploy later by running:\n  cd ' + outputDir + ' && npx cdk deploy')
    }
}
