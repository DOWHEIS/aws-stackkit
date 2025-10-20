import {fileURLToPath} from "url";
import path from "path";
import Mustache from "mustache";
import {readFile, mkdir, writeFile} from "fs/promises";
import {logger} from "./Logger.js";
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export class TemplateService {
    private readonly templatesDir: string

    constructor(templatesDir?: string) {
        this.templatesDir = templatesDir || path.join(__dirname, '..', 'templates');
    }

    async renderToFile(templateName: string, context: any, outputPath: string): Promise<void> {
        const content = await this.render(templateName, context)

        const dir = path.dirname(outputPath)
        await mkdir(dir, { recursive: true })

        await writeFile(outputPath, content, 'utf-8')
        logger.info(`Generated ${outputPath}`)
    }

    async render(templateName: string, context: any): Promise<string> {
        const template = await this.loadTemplate(templateName)
        return Mustache.render(template, context)
    }

    private async loadTemplate(templateName: string): Promise<string> {
        const templatePath = path.join(this.templatesDir, templateName)
        return await readFile(templatePath, 'utf-8')
    }
}