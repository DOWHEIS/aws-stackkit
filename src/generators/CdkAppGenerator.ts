import path from 'path'
import { TemplateService } from '../services/TemplateService.js'
import { Generator } from './Generator.js'
import { ApiDefinition } from '../models/ApiDefinition.js'

export class CdkAppGenerator implements Generator {
    constructor(private templateService: TemplateService) {}

    async generate(api: ApiDefinition, outputDir: string): Promise<void> {
        const stackName = this.getStackName(api.name)

        await this.templateService.renderToFile(
            'app.mustache',
            { stackFileName: `${stackName}Stack` },
            path.join(outputDir, 'bin', `${stackName}.ts`)
        )
    }

    private getStackName(apiName: string): string {
        return apiName.replace(/\s+/g, '')
    }
}