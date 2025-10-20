import fs from "fs-extra";
import ts from "typescript";
import {PathResolver} from "./PathResolver.js";
import {pathToFileURL} from "url";

export class ImportParser {
    // parses default imports for api.config.ts to map funcion names to file paths

    static async parseImports(filePath: string): Promise<Map<string, string>> {
        const content = await fs.readFile(filePath, 'utf-8')
        const sourceFile = ts.createSourceFile(
            filePath,
            content,
            ts.ScriptTarget.Latest,
            true
        )

        const functionToPath = new Map<string, string>()
        const paths = new PathResolver(import.meta.url)

        const fileUrl = pathToFileURL(filePath).href

        ts.forEachChild(sourceFile, node => {
            if(ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
                const importPath = node.moduleSpecifier.text;

                if(!importPath.startsWith('.') && !importPath.startsWith('/')) {
                    return;
                }

                if(node.importClause?.name) {
                    const functionName = node.importClause.name.text

                    let resolvedPath = paths.relative(importPath, fileUrl)

                    if(!resolvedPath.endsWith('.ts')) {
                        resolvedPath += '.ts'
                    }

                    const relativePath = paths.toRelative(resolvedPath)
                    functionToPath.set(functionName, relativePath)
                }
            }
        })

        return functionToPath
    }
}