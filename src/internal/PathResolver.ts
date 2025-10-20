import {fileURLToPath} from "url";
import path from "path";
import fs from "fs-extra";

export class PathResolver {
    private sdkRoot: string
    private userRoot: string = process.cwd()

    constructor(importMetaUrl: string) {
        const currentFile = fileURLToPath(importMetaUrl)
        this.sdkRoot = this.findSdkRoot(currentFile)
    }

    sdk(relativePath: string): string {
        return path.join(this.sdkRoot, relativePath)
    }

    user(relativePath: string): string {
        return path.join(this.userRoot, relativePath)
    }

    relative(relativePath: string, fromFileUrl: string): string {
        const dir = path.dirname(fileURLToPath(fromFileUrl))
        return path.join(dir, relativePath)
    }

    resolve(relativePath: string): string {
        if (path.isAbsolute(relativePath)) {
            return relativePath
        }

        const userPath = this.user(relativePath);
        if (fs.existsSync(userPath)) {
            return userPath
        }
        const sdkPath = this.sdk(relativePath);
        if (fs.existsSync(sdkPath)) {
            return sdkPath
        }

        return userPath
    }

    toRelative(absolutePath: string): string {
        const userRelative = path.relative(this.userRoot, absolutePath)

        if (userRelative.startsWith('..')) {
            const sdkRelative = path.relative(this.sdkRoot, absolutePath);
            if (!sdkRelative.startsWith('..')) {
                if (!sdkRelative.startsWith('..')) {
                    return `<sdk>/${sdkRelative}`
                }
            }
        }
        return userRelative
    }

    isPackaged(): boolean {
        return this.sdkRoot.includes('node_modules')
    }

    private findSdkRoot(startPath: string): string {
        let current = path.dirname(startPath)

        while (current !== path.dirname(current)) {
            const pkgPath = path.join(current, 'package.json')
            if (fs.existsSync(pkgPath)) {
                try {
                    const pkg = fs.readJsonSync(pkgPath)
                    if (pkg.name === 'aws-stackkit') {
                        return current
                    }
                } catch (e) {
                }
            }
            current = path.dirname(current)
        }

        return path.dirname(startPath)
    }
}
