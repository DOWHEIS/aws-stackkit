import path from 'path'
import fs from 'fs-extra'
import { fileURLToPath } from 'url'
import { Generator } from './Generator.js'
import { ApiDefinition } from '../models/ApiDefinition.js'
import { logger } from '../services/Logger.js'
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export class HelpersGenerator implements Generator {

    async generate(api: ApiDefinition, outputDir: string): Promise<void> {
        const srcHelpers = path.join(__dirname, '..', 'helpers')
        const destHelpers = path.join(outputDir, 'helpers')

        await fs.remove(destHelpers)
        await fs.copy(srcHelpers, destHelpers)

        logger.info(`Generated helpers in ${destHelpers}`)
    }
}