import path from 'path'
import fs from 'fs-extra'
import { Generator } from './Generator.js'
import { ApiDefinition } from '../models/ApiDefinition.js'
import { DependencyBundler } from '../services/DependencyBundler.js'
import type { RouteConfig } from '../api/types.js'

export class HandlerWrapperGenerator implements Generator {
    private bundler = new DependencyBundler()

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

        console.log(`Generated wrapped handlers for ${api.routes.length} routes`)
        if (allNpmDependencies.size > 0) {
            console.log(`Collected ${allNpmDependencies.size} unique npm dependencies`)
        }
    }

    private async generateSingleWrapper(route: RouteConfig, wrappedDir: string, api: ApiDefinition) {
        const routeName = this.getRouteName(route.lambda)
        const routeDir = path.join(wrappedDir, routeName)

        await fs.ensureDir(routeDir)

        console.log(`Bundling dependencies for ${routeName}...`)
        const bundleResult = await this.bundler.bundleHandler(route.lambda, routeDir, wrappedDir)

        // await this.patchSdkImports(bundleResult.entryFile)

        const authFnSource = api.config.auth ? api.config.auth.toString() : undefined;
        await this.generateWrapperIndex(route, routeDir, authFnSource);

        const totalDeps = bundleResult.npmDependencies.length +
            (bundleResult.addedDependencies ? Object.keys(bundleResult.addedDependencies).length : 0)

        console.log(`Wrapped handler for "${route.path}" → wrapped/${routeName}/ (${bundleResult.copiedFiles.length} files, ${totalDeps} total deps)`)

        return bundleResult
    }

    private async patchSdkImports(handlerPath: string): Promise<void> {
        let handlerSource = await fs.readFile(handlerPath, 'utf-8')

        handlerSource = handlerSource.replace(
            /from\s+['"]\.\.\/\.\.\/src\/helpers\/(.*?)(\.js)?['"]/g,
            (_match, modulePath) => `from "../../helpers/${modulePath}"`
        )

        await fs.writeFile(handlerPath, handlerSource, 'utf-8')
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
                console.warn('Could not read main package.json:', error)
            }
        }

        if (!packageJson.dependencies) {
            packageJson.dependencies = {}
        }

        let addedCount = 0
        for (const [packageName, version] of npmDependencies) {
            if (!packageJson.dependencies[packageName]) {
                packageJson.dependencies[packageName] = version
                console.log(`  Added to package.json: ${packageName}@${version}`)
                addedCount++
            } else if (packageJson.dependencies[packageName] === 'latest' && version !== 'latest') {
                // Update 'latest' to a more specific version
                packageJson.dependencies[packageName] = version
                console.log(`  Updated in package.json: ${packageName}@${version} (was 'latest')`)
                addedCount++
            }
        }

        if (addedCount > 0) {
            await fs.writeJson(packageJsonPath, packageJson, { spaces: 2 })
            console.log(`Updated main package.json with ${addedCount} dependencies`)
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