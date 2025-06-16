import * as path from 'path'
import { runCommand } from './runCommand.js'

export function formatCdk() {
    return runCommand('npx', ['prettier', '--write', '.'], path.resolve('cdk'))
}