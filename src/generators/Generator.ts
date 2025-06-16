import {ApiDefinition} from "../models/ApiDefinition.js";

export interface Generator {
    generate(api: ApiDefinition, outputDir: string): Promise<void>
}