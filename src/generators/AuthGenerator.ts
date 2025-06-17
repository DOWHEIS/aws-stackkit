import path from 'path'
import fs from 'fs-extra'
import { fileURLToPath } from 'url'
import { Generator } from './Generator.js'
import { ApiDefinition } from '../models/ApiDefinition.js'
import {createLogger} from "../services/LoggerService.js";

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export class AuthGenerator implements Generator {
    private logger = createLogger('Generators:AuthGenerator')
    async generate(api: ApiDefinition, outputDir: string): Promise<void> {
        this.logger.warn("No auth generator implemented yet, skipping...")
    }
}