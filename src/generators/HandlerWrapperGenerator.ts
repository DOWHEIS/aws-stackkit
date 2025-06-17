import path from 'path'
import fs from 'fs-extra'
import { Generator } from './Generator.js'
import { ApiDefinition } from '../models/ApiDefinition.js'
import { DependencyBundler } from '../services/DependencyBundler.js'
import type { RouteConfig } from '../api/types.js'
import {createLogger} from "../services/LoggerService.js";

export class HandlerWrapperGenerator implements Generator {
    private bundler = new DependencyBundler()
    private logger = createLogger('Generator:HandlerWrapper')


    async generate(api: ApiDefinition, outputDir: string): Promise<void> {
        const wrappedDir = path.join(outputDir, 'wrapped')
        await fs.ensureDir(wrappedDir)

        const allNpmDependencies = new Map<string, string>()

        for (const route of api.routes) {
            const bundleResult = await this.generateSingleWrapper(route, wrappedDir, api)

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

        this.logger.info(`Generated wrapped handlers for ${api.routes.length} routes`)
        if (allNpmDependencies.size > 0) {
            this.logger.info(`Collected ${allNpmDependencies.size} unique npm dependencies`)
        }
    }

    private async generateSingleWrapper(route: RouteConfig, wrappedDir: string, api: ApiDefinition) {
        const routeName = this.getRouteName(route.lambda)
        const routeDir = path.join(wrappedDir, routeName)

        await fs.ensureDir(routeDir)

        this.logger.info(`Bundling dependencies for ${routeName}...`)
        const bundleResult = await this.bundler.bundleHandler(route.lambda, routeDir, wrappedDir)

        const authFnSource = api.config.auth ? api.config.auth.toString() : undefined;
        await this.generateWrapperIndex(route, routeDir, authFnSource);

        const totalDeps = bundleResult.npmDependencies.length +
            (bundleResult.addedDependencies ? Object.keys(bundleResult.addedDependencies).length : 0)

        this.logger.success(`Wrapped handler for "${route.path}" → wrapped/${routeName}/ (${bundleResult.copiedFiles.length} files, ${totalDeps} total deps)`)

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
                this.logger.warn('Could not read main package.json:', error)
            }
        }

        if (!packageJson.dependencies) {
            packageJson.dependencies = {}
        }

        let addedCount = 0
        for (const [packageName, version] of npmDependencies) {
            if (!packageJson.dependencies[packageName]) {
                packageJson.dependencies[packageName] = version
                this.logger.info(`  Added to package.json: ${packageName}@${version}`)
                addedCount++
            } else if (packageJson.dependencies[packageName] === 'latest' && version !== 'latest') {
                packageJson.dependencies[packageName] = version
                this.logger.info(`  Updated in package.json: ${packageName}@${version} (was 'latest')`)
                addedCount++
            }
        }

        if (addedCount > 0) {
            await fs.writeJson(packageJsonPath, packageJson, { spaces: 2 })
            this.logger.success(`Updated main package.json with ${addedCount} dependencies`)
        }
    }

    private async generateWrapperIndex(
        route: RouteConfig,
        routeDir: string,
        authFnSource?: string
    ): Promise<void> {
        const useAuth = !!route.auth;

        const wrapperContent = `// Auto-generated wrapper
        import handler from './handler'
        import { wrapHandler } from '../../helpers/wrapHandler'
        
        export const main = wrapHandler(handler${useAuth && authFnSource ? `, {\n  auth: ${authFnSource.trim()}\n}` : ''})
        `;

        await fs.writeFile(path.join(routeDir, 'index.ts'), wrapperContent, 'utf-8');
    }


    private getRouteName(lambdaPath: string): string {
        return path.basename(lambdaPath, path.extname(lambdaPath))
    }
}