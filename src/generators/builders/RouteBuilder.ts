import { Builder } from './Builder.js'
import { ProcessedRouteConfig } from '../../api/types.js'

export class RouteBuilder extends Builder {
    private resourceMap = new Map<string, string>()

    async build(routes: ProcessedRouteConfig[]): Promise<string> {
        const lines: string[] = []

        for (let i = 0; i < routes.length; i++) {
            const resourceLines = await this.ensureResourcePath(routes[i].path)
            const methodLine = await this.buildMethod(routes[i], i)

            lines.push(...resourceLines, methodLine)
        }

        return lines.join('\n')
    }

    private async ensureResourcePath(routePath: string): Promise<string[]> {
        const segments = routePath.split('/').filter(Boolean)
        const lines: string[] = []
        let currentPath = ''
        let parentVar = 'api.root'

        for (const segment of segments) {
            currentPath += '/' + segment

            if (!this.resourceMap.has(currentPath)) {
                const varName = this.generateResourceVarName(currentPath)

                lines.push(await this.renderFragment('routes/resource.mustache', {
                    varName,
                    parentVar,
                    resourceName: segment
                }))

                this.resourceMap.set(currentPath, varName)
            }

            parentVar = this.resourceMap.get(currentPath)!
        }

        return lines
    }

    private async buildMethod(route: ProcessedRouteConfig, lambdaIndex: number): Promise<string> {
        const resourceVar = this.resourceMap.get(route.path) || 'api.root'
        const options = await this.buildMethodOptions(route)

        return this.renderFragment('routes/method.mustache', {
            resourceVar,
            method: route.method,
            lambdaIndex,
            options
        })
    }

    private async buildMethodOptions(route: ProcessedRouteConfig): Promise<string> {
        const hasOptions = Boolean(route.throttling) ||
            (typeof route.auth === 'object' && route.auth.type === 'apiKey')

        return this.renderIf(hasOptions, 'routes/method-options.mustache', {
            apiKeyRequired: typeof route.auth === 'object' && route.auth.type === 'apiKey' ? {
                required: route.auth.required !== false
            } : null
        })
    }

    private generateResourceVarName(path: string): string {
        const segments = path.split('/').filter(Boolean)

        const camelCased = segments.map((segment, index) => {
            const clean = segment.replace(/[{}]/g, '')
            const alphanumeric = clean.replace(/[^a-zA-Z0-9]/g, '')

            if (index === 0) {
                return alphanumeric.toLowerCase()
            }
            return alphanumeric.charAt(0).toUpperCase() + alphanumeric.slice(1).toLowerCase()
        }).join('')

        return `${camelCased}Resource`
    }
}