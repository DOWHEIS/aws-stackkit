import path from 'path'
import fs from 'fs-extra'
import { DependencyAnalyzer, LocalDependency, NpmDependency } from './DependencyAnalyzer.js'
import {logger} from "./Logger.js";

export interface BundleResult {
    copiedFiles: string[]
    entryFile: string
    npmDependencies: NpmDependency[]
    addedDependencies?: Record<string, string>
}

export class DependencyBundler {
    private analyzer = new DependencyAnalyzer()
    private static sharedFiles = new Map<string, string>()
    private isDev = process.env.SDK_DEV_SERVER === '1'

    private getSharedPathPrefix(): string {
        return this.isDev ? './shared' : '../shared'
    }

    async bundleHandler(
        handlerPath: string,
        outputDir: string,
        wrappedDir: string,
    ): Promise<BundleResult> {
        const analysis = await this.analyzer.analyzeDependencies(handlerPath)

        logger.info(`Found ${analysis.localDependencies.length} local dependencies and ${analysis.npmDependencies.length} npm dependencies for ${path.basename(handlerPath)}`)

        const entryFile = path.join(outputDir, 'handler.ts')

        await fs.copy(handlerPath, entryFile)

        const sharedDir = path.join(wrappedDir, 'shared')
        await fs.ensureDir(sharedDir)

        for (const dep of analysis.localDependencies) {
            await this.copyLocalDependency(dep, sharedDir)
        }

        const publicPackages: NpmDependency[] = []
        const discoveredDependencies = new Map<string, string>()

        for (const pkg of analysis.npmDependencies) {
            if (pkg.isPrivate && pkg.packagePath) {
                await this.copyPrivatePackage(pkg, sharedDir)

                if (pkg.dependencies) {
                    for (const dep of pkg.dependencies) {
                        const version = pkg.dependencyVersions?.[dep] || 'latest'
                        discoveredDependencies.set(dep, version)
                    }
                }
            } else {
                publicPackages.push(pkg)
            }
        }

        for (const pkg of publicPackages) {
            discoveredDependencies.set(pkg.packageName, pkg.version || 'latest')
        }

        await this.updateImports(entryFile, analysis.localDependencies, analysis.npmDependencies)

        const addedDependencies: Record<string, string> = {}
        for (const [name, version] of discoveredDependencies) {
            addedDependencies[name] = version
        }

        return {
            copiedFiles: [entryFile],
            entryFile,
            npmDependencies: publicPackages,
            addedDependencies
        }
    }

    private async copyLocalDependency(dep: LocalDependency, sharedDir: string): Promise<void> {
        const existingSharedName = DependencyBundler.sharedFiles.get(dep.resolvedPath)
        if (existingSharedName) {
            const existingPath = path.join(sharedDir, existingSharedName)
            await fs.copy(dep.resolvedPath, existingPath, { overwrite: true })
            logger.info(`Updated existing shared file: ${existingSharedName}`)
            return
        }

        const fileName = path.basename(dep.resolvedPath)
        const destPath = path.join(sharedDir, fileName)

        let finalFileName = fileName
        let finalPath = destPath

        if (await fs.pathExists(destPath)) {
            const existingSource = Array.from(DependencyBundler.sharedFiles.entries())
                .find(([_, name]) => name === fileName)?.[0]

            if (existingSource && existingSource !== dep.resolvedPath) {
                let counter = 1
                const ext = path.extname(fileName)
                const base = path.basename(fileName, ext)

                do {
                    finalFileName = `${base}_${counter}${ext}`
                    finalPath = path.join(sharedDir, finalFileName)
                    counter++
                } while (await fs.pathExists(finalPath) ||
                Array.from(DependencyBundler.sharedFiles.values()).includes(finalFileName))

                logger.info(`Name conflict resolved: ${fileName} -> ${finalFileName}`)
            }
        }

        await fs.copy(dep.resolvedPath, finalPath)
        DependencyBundler.sharedFiles.set(dep.resolvedPath, finalFileName)
        console.log(`Copied to shared: ${path.basename(dep.resolvedPath)} -> shared/${finalFileName}`)
    }

    private async copyPrivatePackage(pkg: NpmDependency, sharedDir: string): Promise<void> {
        logger.info(`\nProcessing private package: ${pkg.packageName}, path: ${pkg.packagePath}, subpaths: [${pkg.subpaths?.join(', ')}], importedItems: ${pkg.importedItems?.join(', ')}, requiredFiles: ${pkg.requiredFiles?.join(', ')}`)
        if (!pkg.packagePath) return;

        const pkgRoot = pkg.packagePath;
        const destDir = path.join(sharedDir, pkg.packageName);
        await fs.ensureDir(destDir);

        if (pkg.requiredFiles && pkg.requiredFiles.length > 0) {
            logger.info(`Selectively copying ${pkg.requiredFiles.length} files from ${pkg.packageName}`)

            const pathMapping = new Map<string, string>()
            const usedNames = new Set<string>()

            for (const file of pkg.requiredFiles) {
                const src = path.join(pkgRoot, file)

                if (await fs.pathExists(src)) {
                    let destFile: string

                    if (file === 'package.json') {
                        destFile = 'package.json'
                    } else {
                        const basename = path.basename(file)
                        const ext = path.extname(basename)
                        const nameWithoutExt = path.basename(basename, ext)

                        if (usedNames.has(basename)) {
                            const parentDir = path.basename(path.dirname(file))
                            let candidateName = `${parentDir}_${basename}`

                            if (usedNames.has(candidateName)) {
                                let counter = 1
                                do {
                                    candidateName = `${parentDir}_${nameWithoutExt}_${counter}${ext}`
                                    counter++
                                } while (usedNames.has(candidateName))
                            }

                            destFile = candidateName
                            logger.info(`  Name collision resolved: ${basename} -> ${destFile}`)
                        } else {
                            destFile = basename
                        }

                        usedNames.add(destFile)
                    }

                    pathMapping.set(file, destFile)

                    const dest = path.join(destDir, destFile)
                    await fs.copy(src, dest)
                    logger.info(`  Copied: ${file} -> ${destFile}`)
                }
            }

            pkg.pathMapping = pathMapping

            if (pkg.dependencies && pkg.dependencies.length > 0) {
                logger.info(`  External dependencies found: ${pkg.dependencies.join(', ')}`)
            }

            if (!pathMapping.has('package.json') && pkg.dependencies && pkg.dependencies.length > 0) {
                const pkgJsonPath = path.join(pkgRoot, 'package.json')
                if (await fs.pathExists(pkgJsonPath)) {
                    try {
                        const pkgJson = await fs.readJson(pkgJsonPath)
                        pkg.dependencyVersions = {}
                        for (const dep of pkg.dependencies) {
                            const version = pkgJson.dependencies?.[dep] ||
                                pkgJson.devDependencies?.[dep] ||
                                pkgJson.peerDependencies?.[dep]
                            if (version) {
                                pkg.dependencyVersions[dep] = version
                            }
                        }
                    } catch (err) {
                        logger.warn(`Could not read package.json for dependency versions:`, err)
                    }
                }
            }
        } else {
            logger.info(`Copying entire private package ${pkg.packageName} (no selective info available)`)

            await fs.copy(pkgRoot, destDir, {
                filter: (src) => {
                    const rel = path.relative(pkgRoot, src);
                    if (rel === '') return true;
                    const [firstSegment] = rel.split(path.sep);
                    return firstSegment !== 'node_modules';
                }
            });
        }

        DependencyBundler.sharedFiles.set(pkg.packageName, pkg.packageName);
        logger.info(`Copied private package to shared/${pkg.packageName}`);
    }

    private async updateImports(
        filePath: string,
        localDeps: LocalDependency[],
        npmDeps: NpmDependency[]
    ): Promise<void> {
        let content = await fs.readFile(filePath, 'utf-8')
        logger.info('\nUpdating imports in', path.basename(filePath))

        const sharedPathPrefix = this.getSharedPathPrefix()

        // Update local dependencies
        for (const dep of localDeps) {
            const sharedName = DependencyBundler.sharedFiles.get(dep.resolvedPath)
            if (!sharedName) {
                logger.warn(`No shared file mapping for ${dep.resolvedPath}`)
                continue
            }

            const baseName = sharedName.replace(/\.(ts|js)$/, '')
            const newImport = `${sharedPathPrefix}/${baseName}`

            const importPattern = dep.originalPath
            const escapedPattern = importPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

            const patterns = [
                new RegExp(`(from\\s+["'])${escapedPattern}(["'])`, 'g'),
                new RegExp(`(require\\s*\\(\\s*["'])${escapedPattern}(["']\\s*\\))`, 'g'),
                new RegExp(`(import\\s*\\(\\s*["'])${escapedPattern}(["']\\s*\\))`, 'g')
            ]

            for (const pattern of patterns) {
                const before = content
                content = content.replace(pattern, `$1${newImport}$2`)
                if (content !== before) {
                    logger.info(`Updated import: "${dep.originalPath}" -> "${newImport}"`)
                }
            }
        }

        // NEW: Update npm dependencies with subpath support
        for (const pkg of npmDeps) {
            if (!pkg.isPrivate || !DependencyBundler.sharedFiles.has(pkg.packageName)) continue

            // Handle packages with subpaths
            if (pkg.subpaths && pkg.subpaths.length > 0) {
                logger.info(`Processing subpath imports for ${pkg.packageName}: [${pkg.subpaths.join(', ')}]`)

                for (const subpath of pkg.subpaths) {
                    const fullImport = `${pkg.packageName}${subpath}`
                    const escapedPackage = pkg.packageName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
                    const escapedSubpath = subpath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

                    // Pattern to match: from "aws-stackkit/db"
                    const subpathPattern = new RegExp(
                        `(from\\s+["'])${escapedPackage}${escapedSubpath}(["'])`,
                        'g'
                    )

                    // NEW: Rewrite to shared location with subpath preserved
                    const newImportPath = `${sharedPathPrefix}/${pkg.packageName}${subpath}`

                    const before = content
                    content = content.replace(subpathPattern, `$1${newImportPath}$2`)

                    if (content !== before) {
                        logger.info(`✓ Updated subpath import: "${fullImport}" -> "${newImportPath}"`)
                    }

                    // Also handle require() and dynamic import()
                    const requirePattern = new RegExp(
                        `(require\\s*\\(\\s*["'])${escapedPackage}${escapedSubpath}(["']\\s*\\))`,
                        'g'
                    )
                    content = content.replace(requirePattern, `$1${newImportPath}$2`)

                    const dynamicImportPattern = new RegExp(
                        `(import\\s*\\(\\s*["'])${escapedPackage}${escapedSubpath}(["']\\s*\\))`,
                        'g'
                    )
                    content = content.replace(dynamicImportPattern, `$1${newImportPath}$2`)
                }
            }

            // Handle selective imports with export source maps (existing logic)
            if (pkg.importedItems && pkg.exportSourceMap && !pkg.importedItems.includes('*')) {
                const importRegex = new RegExp(
                    `(import\\s+{([^}]+)}\\s+from\\s+["'])${pkg.packageName}(["'])`,
                    'g'
                )

                content = content.replace(importRegex, (match, prefix, imports, suffix) => {
                    const importList = imports.split(',').map((s: string) => s.trim())

                    const sourceFiles = new Set<string>()
                    for (const imp of importList) {
                        const cleanImport = imp.split(' as ')[0].trim()
                        const sourceFile = pkg.exportSourceMap!.get(cleanImport)
                        if (sourceFile && pkg.pathMapping) {
                            const flattenedPath = pkg.pathMapping.get(sourceFile) || path.basename(sourceFile)
                            const cleanPath = flattenedPath.replace(/\.js$/, '')
                            sourceFiles.add(cleanPath)
                        }
                    }

                    if (sourceFiles.size === 1) {
                        const sourceFile = Array.from(sourceFiles)[0]
                        const newImportPath = `${sharedPathPrefix}/${pkg.packageName}/${sourceFile}`
                        logger.info(`Updated private package import: "${pkg.packageName}" -> "${newImportPath}"`)
                        return `${prefix}${newImportPath}${suffix}`
                    } else {
                        const newImportBase = `${sharedPathPrefix}/${pkg.packageName}`
                        logger.info(`Updated private package import: "${pkg.packageName}" -> "${newImportBase}"`)
                        return `${prefix}${newImportBase}${suffix}`
                    }
                })
            } else {
                // Handle base package imports (no subpath, no selective mapping)
                const newImportBase = `${sharedPathPrefix}/${pkg.packageName}`

                const patterns = [
                    new RegExp(`(from\\s+["'])${pkg.packageName}(["'])`, 'g'),
                    new RegExp(`(require\\s*\\(\\s*["'])${pkg.packageName}(["']\\s*\\))`, 'g'),
                ]

                content = content.replace(patterns[0], `$1${newImportBase}$2`)
                content = content.replace(patterns[1], `$1${newImportBase}$2`)
                logger.info(`Updated private package import: "${pkg.packageName}" -> "${newImportBase}"`)
            }
        }

        await fs.writeFile(filePath, content, 'utf-8')
        logger.info('Import updates complete\n')
    }
}
