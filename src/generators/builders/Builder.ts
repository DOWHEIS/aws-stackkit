import { TemplateService } from '../../services/TemplateService.js'
import { ApiDefinition } from '../../models/ApiDefinition.js'


export abstract class Builder {
    constructor(protected templateService: TemplateService) {}

    /**
     * Renders a template fragment with the given context
     */
    protected async renderFragment(fragmentPath: string, context: any): Promise<string> {
        return this.templateService.render(`fragments/${fragmentPath}`, context)
    }

    /**
     * Renders multiple fragments and joins them
     */
    protected async renderFragments(
        fragments: Array<{ path: string; context: any }>,
        separator: string = '\n'
    ): Promise<string> {
        const rendered = await Promise.all(
            fragments.map(f => this.renderFragment(f.path, f.context))
        )
        return rendered.join(separator)
    }

    protected async renderIf(
        condition: boolean,
        fragmentPath: string,
        context: any
    ): Promise<string> {
        return condition ? this.renderFragment(fragmentPath, context) : ''
    }

    protected sanitizeName(name: string): string {
        return name.replace(/[^a-zA-Z0-9]/g, '')
    }

    protected sanitizeDbName(name: string): string {
        return name.replace(/[^a-zA-Z0-9_]/g, '_')
    }

    protected getStackName(api: ApiDefinition): string {
        return this.sanitizeName(api.name)
    }

    protected getResourceName(stackName: string, resourceType: string, index?: number): string {
        const base = `${stackName}${resourceType}`
        return index !== undefined ? `${base}${index}` : base
    }

    protected async mapToFragments<T>(
        items: T[],
        transformer: (item: T, index: number) => Promise<string>
    ): Promise<string[]> {
        return Promise.all(items.map(transformer))
    }

    protected buildBaseContext(api: ApiDefinition, additionalContext: any = {}): any {
        return {
            stackName: this.getStackName(api),
            ...additionalContext
        }
    }

    abstract build(...args: any[]): Promise<any>
}