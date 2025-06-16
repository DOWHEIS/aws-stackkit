import path from 'path'
import fs from 'fs-extra'
import { createRequire } from 'module'
import ts from 'typescript'

export interface LocalDependency {
    originalPath: string
    resolvedPath: string
}

export interface NpmDependency {
    packageName: string
    version?: string
    isPrivate?: boolean
    packagePath?: string
    importedItems?: string[]
    requiredFiles?: string[]
    dependencies?: string[]
    exportSourceMap?: Map<string, string>
    pathMapping?: Map<string, string>
    dependencyVersions?: Record<string, string>
}

export interface DependencyAnalysisResult {
    localDependencies: LocalDependency[]
    npmDependencies: NpmDependency[]
}

export class DependencyAnalyzer {
    private static readonly tsCompilerOptions: ts.CompilerOptions = {
        moduleResolution: ts.ModuleResolutionKind.NodeNext,
        target: ts.ScriptTarget.ESNext,
        allowJs: true,
    }

    async analyzeDependencies(entryFile: string): Promise<DependencyAnalysisResult> {
        const absEntry = path.resolve(entryFile)
        const visited = new Set<string>()
        const toVisit = [absEntry]

        const localDepsMap = new Map<string, string>()
        const npmPackageMap = new Map<string, {
            importedItems: Set<string>
            version?: string
            isPrivate?: boolean
            packagePath?: string
        }>()

        while (toVisit.length) {
            const filePath = toVisit.pop()!
            if (visited.has(filePath)) continue
            visited.add(filePath)

            let importDetails: Array<{spec: string, importedItems: string[]}>
            try {
                importDetails = await this.extractImportsFromFile(filePath)
            } catch (err) {
                console.warn(`Failed to parse ${filePath}:`, err)
                continue
            }

            for (const {spec, importedItems} of importDetails) {
                if (this.isLocalImport(spec)) {
                    const resolved = this.resolveLocalImport(spec, filePath)
                    if (resolved) {
                        if (!localDepsMap.has(resolved)) {
                            localDepsMap.set(resolved, spec)
                            toVisit.push(resolved)
                        }
                    } else {
                        console.warn(`Could not resolve local import "${spec}" in ${filePath}`)
                    }
                } else {
                    const packageName = this.extractPackageName(spec)
                    const existing = npmPackageMap.get(packageName) || {
                        importedItems: new Set<string>()
                    }

                    importedItems.forEach(item => existing.importedItems.add(item))
                    npmPackageMap.set(packageName, existing)
                }
            }
        }

        const localDependencies: LocalDependency[] = Array.from(localDepsMap.entries())
            .map(([resolvedPath, originalPath]) => ({ originalPath, resolvedPath }))

        const npmDependencies = await this.resolveNpmDependencies(npmPackageMap, entryFile)
        return { localDependencies, npmDependencies }
    }

    private async extractImportsFromFile(filePath: string): Promise<Array<{spec: string, importedItems: string[]}>> {
        const content = await fs.readFile(filePath, 'utf-8')
        const sf = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true)
        const imports: Array<{spec: string, importedItems: string[]}> = []

        const visit = (node: ts.Node) => {
            if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
                const spec = node.moduleSpecifier.text
                const importedItems: string[] = []

                if (node.importClause) {
                    if (node.importClause.namedBindings && ts.isNamedImports(node.importClause.namedBindings)) {
                        node.importClause.namedBindings.elements.forEach(element => {
                            importedItems.push(element.propertyName?.text || element.name.text)
                        })
                    }
                    if (node.importClause.name) {
                        importedItems.push('default')
                    }
                    if (node.importClause.namedBindings && ts.isNamespaceImport(node.importClause.namedBindings)) {
                        importedItems.push('*')
                    }
                }

                if (importedItems.length === 0) {
                    importedItems.push('*')
                }

                imports.push({ spec, importedItems })
            }
            else if (ts.isCallExpression(node) &&
                ts.isIdentifier(node.expression) &&
                node.expression.text === 'require' &&
                node.arguments[0] &&
                ts.isStringLiteral(node.arguments[0])) {
                imports.push({
                    spec: node.arguments[0].text,
                    importedItems: ['*']
                })
            }
            else if (ts.isCallExpression(node) &&
                node.expression.kind === ts.SyntaxKind.ImportKeyword &&
                node.arguments[0] &&
                ts.isStringLiteral(node.arguments[0])) {
                imports.push({
                    spec: node.arguments[0].text,
                    importedItems: ['*']
                })
            }

            ts.forEachChild(node, visit)
        }

        visit(sf)
        return imports
    }

    private isLocalImport(spec: string): boolean {
        return spec.startsWith('./') ||
            spec.startsWith('../') ||
            spec.startsWith('/') ||
            path.isAbsolute(spec)
    }

    private resolveLocalImport(spec: string, fromFile: string): string | null {
        const { resolvedModule } = ts.resolveModuleName(
            spec,
            fromFile,
            DependencyAnalyzer.tsCompilerOptions,
            ts.sys
        )
        if (
            resolvedModule?.resolvedFileName &&
            !resolvedModule.resolvedFileName.includes('node_modules') &&
            !resolvedModule.resolvedFileName.endsWith('.d.ts')
        ) {
            return resolvedModule.resolvedFileName
        }
        return null
    }

    private extractPackageName(importPath: string): string {
        const parts = importPath.split('/')
        return importPath.startsWith('@') && parts.length >= 2
            ? `${parts[0]}/${parts[1]}`
            : parts[0]
    }

    private async resolveNpmDependencies(
        packageMap: Map<string, {
            importedItems: Set<string>
            version?: string
            isPrivate?: boolean
            packagePath?: string
        }>,
        entryFile: string
    ): Promise<NpmDependency[]> {
        const projectPkg = await this.findPackageJson(entryFile)
        const result: NpmDependency[] = []

        for (const [name, info] of packageMap) {
            const version =
                projectPkg?.dependencies?.[name] ||
                projectPkg?.devDependencies?.[name] ||
                projectPkg?.peerDependencies?.[name] ||
                'latest'

            const pkgInfo = await this.getPackageInfo(name, entryFile)
            let isPrivate = pkgInfo?.isPrivate === true

            if (!isPrivate) {
                isPrivate = await this.isNotOnPublicRegistry(name)
            }

            const dependency: NpmDependency = {
                packageName: name,
                version,
                isPrivate,
                packagePath: pkgInfo?.packagePath,
                importedItems: Array.from(info.importedItems)
            }

            if (isPrivate && pkgInfo?.packagePath) {
                const requiredFiles = await this.analyzeRequiredFiles(
                    pkgInfo.packagePath,
                    info.importedItems
                )
                dependency.requiredFiles = requiredFiles.files
                dependency.dependencies = requiredFiles.dependencies
                dependency.exportSourceMap = requiredFiles.exportSourceMap
            }

            result.push(dependency)
            console.log(
                `Resolved npm dep: ${name}@${version} (private: ${isPrivate}, ` +
                `imported: [${dependency.importedItems?.join(', ')}])`
            )
        }

        return result
    }

    private async analyzeRequiredFiles(
        packagePath: string,
        importedItems: Set<string>
    ): Promise<{ files: string[], dependencies: string[], exportSourceMap: Map<string, string> }> {
        const requiredFiles = new Set<string>()
        const dependencies = new Set<string>()
        const visited = new Set<string>()
        const exportSourceMap = new Map<string, string>()

        if (importedItems.has('*') || importedItems.has('default')) {
            requiredFiles.add('package.json')
        }

        const pkgJsonPath = path.join(packagePath, 'package.json')
        const pkgJson = await fs.readJson(pkgJsonPath).catch(() => ({}))

        if (!importedItems.has('*') && !importedItems.has('default')) {
            const mainFile = pkgJson.main || 'index.js'
            const mainPath = path.join(packagePath, mainFile)

            const exportSources = await this.findExportSources(mainPath, packagePath, importedItems)

            for (const sourcePath of exportSources) {
                const relativeSource = path.relative(packagePath, sourcePath)
                for (const item of importedItems) {
                    const hasExport = await this.fileExportsAny(sourcePath, new Set([item]))
                    if (hasExport) {
                        exportSourceMap.set(item, relativeSource)
                    }
                }

                await this.traceRequiredFiles(
                    sourcePath,
                    packagePath,
                    requiredFiles,
                    dependencies,
                    visited,
                    new Set(['*'])
                )
            }
        } else {
            const mainFile = pkgJson.main || 'index.js'
            const mainPath = path.join(packagePath, mainFile)

            await this.traceRequiredFiles(
                mainPath,
                packagePath,
                requiredFiles,
                dependencies,
                visited,
                importedItems
            )
        }

        return {
            files: Array.from(requiredFiles),
            dependencies: Array.from(dependencies),
            exportSourceMap
        }
    }

    private async findExportSources(
        filePath: string,
        packageRoot: string,
        targetExports: Set<string>
    ): Promise<string[]> {
        const sources: string[] = []

        if (!await fs.pathExists(filePath)) return sources

        try {
            const content = await fs.readFile(filePath, 'utf-8')

            const reExportMatches = content.matchAll(/export\s+\*\s+from\s+["']([^"']+)["']/g)

            for (const match of reExportMatches) {
                const importPath = match[1]
                if (this.isLocalImport(importPath)) {
                    const resolvedPath = path.resolve(path.dirname(filePath), importPath)

                    const extensions = ['', '.js', '.ts', '/index.js', '/index.ts']
                    for (const ext of extensions) {
                        const fullPath = resolvedPath + ext
                        if (await fs.pathExists(fullPath) && fullPath.startsWith(packageRoot)) {
                            const hasTargetExport = await this.fileExportsAny(fullPath, targetExports)
                            if (hasTargetExport) {
                                sources.push(fullPath)
                            }
                            break
                        }
                    }
                }
            }

            const namedExportMatches = content.matchAll(/export\s+{\s*([^}]+)\s*}\s+from\s+["']([^"']+)["']/g)

            for (const match of namedExportMatches) {
                const exportList = match[1]
                const importPath = match[2]

                const hasTargetExport = Array.from(targetExports).some(target =>
                    new RegExp(`\\b${target}\\b`).test(exportList)
                )

                if (hasTargetExport && this.isLocalImport(importPath)) {
                    const resolvedPath = path.resolve(path.dirname(filePath), importPath)

                    const extensions = ['', '.js', '.ts', '/index.js', '/index.ts']
                    for (const ext of extensions) {
                        const fullPath = resolvedPath + ext
                        if (await fs.pathExists(fullPath) && fullPath.startsWith(packageRoot)) {
                            sources.push(fullPath)
                            break
                        }
                    }
                }
            }

        } catch (err) {
            console.warn(`Could not analyze exports in ${filePath}:`, err)
        }

        return sources
    }

    private async fileExportsAny(filePath: string, targetExports: Set<string>): Promise<boolean> {
        try {
            const content = await fs.readFile(filePath, 'utf-8')

            for (const target of targetExports) {
                const patterns = [
                    new RegExp(`export\\s+(?:async\\s+)?function\\s+${target}\\b`),
                    new RegExp(`export\\s+const\\s+${target}\\b`),
                    new RegExp(`export\\s+class\\s+${target}\\b`),
                    new RegExp(`export\\s+{[^}]*\\b${target}\\b[^}]*}`),
                ]

                if (patterns.some(pattern => pattern.test(content))) {
                    return true
                }
            }
        } catch (err) {
            console.warn(`Could not check exports in ${filePath}:`, err)
        }

        return false
    }

    private async traceRequiredFiles(
        filePath: string,
        packageRoot: string,
        requiredFiles: Set<string>,
        dependencies: Set<string>,
        visited: Set<string>,
        importedItems: Set<string>
    ): Promise<void> {
        if (!await fs.pathExists(filePath) || visited.has(filePath)) return
        visited.add(filePath)

        const relativePath = path.relative(packageRoot, filePath)
        requiredFiles.add(relativePath)

        const mapFile = filePath + '.map'
        if (await fs.pathExists(mapFile)) {
            requiredFiles.add(path.relative(packageRoot, mapFile))
        }

        const dtsFile = filePath.replace(/\.js$/, '.d.ts')
        if (await fs.pathExists(dtsFile)) {
            requiredFiles.add(path.relative(packageRoot, dtsFile))
        }

        try {
            const content = await fs.readFile(filePath, 'utf-8')

            const importMatches = [
                ...content.matchAll(/import\s+(?:.*?\s+from\s+)?["']([^"']+)["']/g),
                ...content.matchAll(/require\s*\(\s*["']([^"']+)["']\s*\)/g),
                ...content.matchAll(/from\s+["']([^"']+)["']/g)
            ]

            for (const match of importMatches) {
                const importPath = match[1]

                if (this.isLocalImport(importPath)) {
                    const resolvedPath = path.resolve(path.dirname(filePath), importPath)

                    const extensions = ['', '.js', '.ts', '.jsx', '.tsx', '/index.js', '/index.ts']
                    for (const ext of extensions) {
                        const fullPath = resolvedPath + ext
                        if (await fs.pathExists(fullPath) && fullPath.startsWith(packageRoot)) {
                            await this.traceRequiredFiles(
                                fullPath,
                                packageRoot,
                                requiredFiles,
                                dependencies,
                                visited,
                                new Set(['*'])
                            )
                            break
                        }
                    }
                } else {
                    const packageName = this.extractPackageName(importPath)
                    dependencies.add(packageName)
                }
            }
        } catch (err) {
            console.warn(`Could not trace dependencies in ${filePath}:`, err)
        }
    }

    private async isNotOnPublicRegistry(pkg: string): Promise<boolean> {
        const encoded = encodeURIComponent(pkg)
        const url = `https://registry.npmjs.org/${encoded}`

        try {
            const res = await fetch(url, { method: 'HEAD' })
            return res.status === 404
        } catch (err) {
            console.warn(`Could not reach public registry for ${pkg}; assuming private.`, err)
            return true
        }
    }

    private async getPackageInfo(
        packageName: string,
        entryFile: string
    ): Promise<{ isPrivate: boolean; packagePath: string } | null> {
        try {
            const requireFn = createRequire(path.resolve(entryFile))
            let pkgJsonPath: string

            try {
                pkgJsonPath = requireFn.resolve(`${packageName}/package.json`)
            } catch {
                const main = requireFn.resolve(packageName)
                const root = this.findPackageRoot(main)
                if (!root) return null
                pkgJsonPath = path.join(root, 'package.json')
            }

            const pj = await fs.readJson(pkgJsonPath)
            return { isPrivate: pj.private === true, packagePath: path.dirname(pkgJsonPath) }
        } catch (err) {
            console.warn(`Could not read package info for ${packageName}:`, err)
            return null
        }
    }

    private findPackageRoot(modulePath: string): string | null {
        let dir = path.dirname(modulePath)
        while (dir.includes('node_modules')) {
            if (fs.existsSync(path.join(dir, 'package.json'))) return dir
            const parent = path.dirname(dir)
            if (parent === dir) break
            dir = parent
        }
        return null
    }

    private async findPackageJson(start: string): Promise<any> {
        let dir = path.dirname(path.resolve(start))
        while (true) {
            const candidate = path.join(dir, 'package.json')
            if (await fs.pathExists(candidate)) return fs.readJson(candidate)
            const parent = path.dirname(dir)
            if (parent === dir) break
            dir = parent
        }
        return {}
    }
}