#!/usr/bin/env node

console.log('Starting AWS StackKit CLI...')

import { Command } from 'commander'
import { scaffold } from './cli/scaffold.js'
import { deploy } from './cli/deploy.js'
import { migrate } from './cli/migrate.js'
import { rollback } from './cli/rollback.js'
import { initCore } from './cli/initCore.js'
import { dev } from './cli/dev.js'
import {createMigration} from "./cli/createMigration.js";
import {migrateRollback} from "./cli/migrateRollback.js";

const program = new Command()

program
    .name('api-sdk')
    .description('AWS StackKit CLI')
    .version('1.0.0')

program
    .command('scaffold')
    .description('Generate CDK stack + app from api.config.ts')
    .option('-o, --output <dir>', 'Output directory', 'cdk')
    .action((options) => scaffold(options.output))

program
    .command('deploy')
    .description('Deploy CDK app to AWS')
    .option('--force', 'Force deploy even with destructive changes')
    .action((options) => deploy(options))

program
    .command('migrate')
    .description('Run pending SQL migrations against database')
    .action(migrate)

program
    .command('rollback')
    .description('Rollback CDK files to last deployed configuration')
    .action(rollback)

program
    .command('core:init')
    .description('Deploy the core infrastructure stack (VPC, RDS Cluster, secrets)')
    .action(initCore)

program
    .command('dev')
    .description('Run the development server')
    .action(() => {
        process.env.SDK_DEV_SERVER = '1';
        dev();
    })

program.exitOverride((err) => {
    if (err.exitCode === 0) return
    if (err.code === 'commander.helpDisplayed') return
    console.error('Command failed:', err.message)
    process.exit(1)
})

program
    .command('create:migration <name>')
    .description('Create a new SQL migration file')
    .action(createMigration)

program
    .command('migrate:rollback')
    .description('Rollback database migrations')
    .option('--steps <n>', 'Number of migrations to rollback', '1')
    .action((options) => migrateRollback(options))

program.parse()

if (process.argv.length === 2) {
    program.help()
}
