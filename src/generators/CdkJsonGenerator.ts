import path from 'path'
import { TemplateService } from '../services/TemplateService.js'
import { Generator } from './Generator.js'
import { ApiDefinition } from '../models/ApiDefinition.js'

export class CdkJsonGenerator implements Generator {
    constructor(private templateService: TemplateService) {}

    async generate(api: ApiDefinition, outputDir: string): Promise<void> {
        const stackName = this.getStackName(api.name)

        await this.templateService.renderToFile(
            'cdk.json.mustache',
            { stackFileName: stackName },
            path.join(outputDir, 'cdk.json')
        )
    }

    private getStackName(apiName: string): string {
        return apiName.replace(/\s+/g, '')
    }
}