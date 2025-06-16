import * as path from 'path'
import { promises as fs } from 'fs'
import { ApiConfig } from '../api/types.js'

const metaDir = path.resolve('cdk', '.sdkmeta')
const lastDeployedPath = path.join(metaDir, 'last-deployed.json')
const deployedStackNamePath = path.join(metaDir, 'deployed-stack-name.txt')

export async function writeLastDeployedConfig(config: ApiConfig, stackName: string) {
    await fs.mkdir(metaDir, { recursive: true })
    await fs.writeFile(lastDeployedPath, JSON.stringify(config, null, 2), 'utf-8')
    await fs.writeFile(deployedStackNamePath, stackName, 'utf-8')
}

export async function readLastDeployedConfig(): Promise<ApiConfig | null> {
    try {
        const data = await fs.readFile(lastDeployedPath, 'utf-8')
        return JSON.parse(data)
    } catch {
        return null
    }
}

export async function readLastDeployedStackName(): Promise<string | null> {
    try {
        const name = await fs.readFile(deployedStackNamePath, 'utf-8')
        return name.trim()
    } catch {
        return null
    }
}
