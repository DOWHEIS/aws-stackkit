import path from 'path'
import { TemplateService } from '../services/TemplateService.js'
import { Generator } from './Generator.js'
import { ApiDefinition } from '../models/ApiDefinition.js'

export class PackageJsonGenerator implements Generator {
    constructor(private templateService: TemplateService) {}

    async generate(api: ApiDefinition, outputDir: string): Promise<void> {
        await this.templateService.renderToFile(
            'package.json.mustache',
            { cdkName: this.getCdkName(api.name) },
            path.join(outputDir, 'package.json')
        )
    }

    private getCdkName(apiName: string): string {
        return apiName.replace(/\s+/g, '-').toLowerCase()
    }
}