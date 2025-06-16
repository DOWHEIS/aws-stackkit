import path from 'path'
import { TemplateService } from '../services/TemplateService.js'
import { Generator } from './Generator.js'
import { ApiDefinition } from '../models/ApiDefinition.js'

export class TsconfigGenerator implements Generator {
    constructor(private templateService: TemplateService) {}

    async generate(api: ApiDefinition, outputDir: string): Promise<void> {
        await this.templateService.renderToFile(
            'tsconfig.json.mustache',
            {},
            path.join(outputDir, 'tsconfig.json')
        )
    }
}