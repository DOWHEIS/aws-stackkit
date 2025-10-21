import path from 'path'
import fs from 'fs-extra'
import { Generator } from './Generator.js'
import { ApiDefinition } from '../models/ApiDefinition.js'
import { BundleResult, DependencyBundler } from '../services/DependencyBundler.js'
import type { ProcessedRouteConfig, RouteConfig } from '../api/types.js'
import { PathResolver } from "../internal/PathResolver.js"
import { randomUUID } from "node:crypto"
import { logger } from '../services/Logger.js'

const paths = new PathResolver(import.meta.url)

export class HandlerWrapperGenerator implements Generator {
    private bundler = new DependencyBundler()
    private isDev = process.env.SDK_DEV_SERVER === '1'

    async generate(api: ApiDefinition, outputDir: string): Promise<void> {
        const wrappedDir = path.join(outputDir, 'wrapped')
        await fs.ensureDir(wrappedDir)

        const allNpmDependencies = new Map<string, string>()

        for (const route of api.routes) {
            const bundleResult = await this.generateSingleWrapper(route, wrappedDir)

            for (const npmDep of bundleResult.npmDependencies) {
                allNpmDependencies.set(npmDep.packageName, npmDep.version || 'latest')
            }

            if (bundleResult.addedDependencies) {
                for (const [depName, depVersion] of Object.entries(bundleResult.addedDependencies)) {
                    const existingVersion = allNpmDependencies.get(depName)
                    if (!existingVersion || existingVersion === 'latest') {
                        allNpmDependencies.set(depName, depVersion)
                    }
                }
            }
        }

        await this.updateMainPackageJson(outputDir, allNpmDependencies)

        logger.success(`Generated wrapped handlers for ${api.routes.length} routes`)
        if (allNpmDependencies.size > 0) {
            logger.info(`Collected ${allNpmDependencies.size} unique npm dependencies`)
        }
    }

    async generateSingleWrapper(route: ProcessedRouteConfig, wrappedDir: string) {
        const routeName = this.getRouteName(route.lambda)
        const routeDir = path.join(wrappedDir, routeName)
        logger.info(`Generated wrapped handler for ${routeName}`)

        await fs.ensureDir(routeDir)

        logger.substep(`Bundling dependencies for ${routeName}...`)
        let bundleResult: BundleResult

        // No versioning in dev or prod - just use the route directory
        bundleResult = await this.bundler.bundleHandler(
            route.lambda,
            routeDir,
            wrappedDir,
        )

        await this.generateWrapperIndex(route, routeDir)

        const totalDeps = bundleResult.npmDependencies.length +
            (bundleResult.addedDependencies ? Object.keys(bundleResult.addedDependencies).length : 0)

        logger.info(`Wrapped handler for "${route.path}" → wrapped/${routeName}/ (${bundleResult.copiedFiles.length} files, ${totalDeps} total deps)`)

        return bundleResult
    }

    private async updateMainPackageJson(outputDir: string, npmDependencies: Map<string, string>): Promise<void> {
        if (npmDependencies.size === 0) {
            return
        }

        const packageJsonPath = path.join(outputDir, 'package.json')
        let packageJson: any = {}

        if (await fs.pathExists(packageJsonPath)) {
            try {
                packageJson = await fs.readJson(packageJsonPath)
            } catch (error) {
                logger.warn('Could not read main package.json:', error)
            }
        }

        if (!packageJson.dependencies) {
            packageJson.dependencies = {}
        }

        let addedCount = 0
        for (const [packageName, version] of npmDependencies) {
            if (!packageJson.dependencies[packageName]) {
                packageJson.dependencies[packageName] = version
                logger.substep(`  Added to package.json: ${packageName}@${version}`)
                addedCount++
            } else if (packageJson.dependencies[packageName] === 'latest' && version !== 'latest') {
                // Update 'latest' to a more specific version
                packageJson.dependencies[packageName] = version
                logger.substep(`  Updated in package.json: ${packageName}@${version} (was 'latest')`)
                addedCount++
            }
        }

        if (addedCount > 0) {
            await fs.writeJson(packageJsonPath, packageJson, { spaces: 2 })
            logger.info(`Updated main package.json with ${addedCount} dependencies`)
        }
    }

    private async generateWrapperIndex(route: ProcessedRouteConfig, routeDir: string): Promise<void> {
        const wrapHandlerPath = '../../helpers/wrapHandler'

        const handlerImportPath = this.isDev
            ? path.relative(routeDir, route.lambda).replace(/\\/g, '/').replace(/\.ts$/, '')
            : './handler'

        const authType = route.auth?.type === 'apiKey' ? 'apiKey' : undefined
        const required = route.auth?.required
        let authConfig: string
        if (authType) {
            authConfig = `auth: { type: '${authType}', required: ${required} }`
        } else {
            authConfig = 'auth: false'
        }

        const wrapperContent = `// Auto-generated wrapper\nimport handler from '${handlerImportPath}'\nimport { wrapHandler } from '${wrapHandlerPath}'\n\nexport const main = wrapHandler(handler, { ${authConfig} })\n`

        await fs.writeFile(path.join(routeDir, 'index.ts'), wrapperContent, 'utf-8')
    }

    private getRouteName(lambdaPath: string): string {
        return path.basename(lambdaPath, path.extname(lambdaPath))
    }
}
