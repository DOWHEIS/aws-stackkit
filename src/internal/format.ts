import { runCommand } from './runCommand.js'
import {PathResolver} from "./PathResolver.js";

export function formatCdk(isDev: boolean, importMetaUrl: string) {
    const paths = new PathResolver(importMetaUrl)
    const cdkPath = isDev
        ? paths.user('.cdk_dev')
        : paths.user('cdk')

    return runCommand('npx', ['prettier', '--write', '.'], cdkPath)
}
