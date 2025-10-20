import {Builder} from './Builder.js'

export class DatabaseBuilder extends Builder {

    async build(stackName: string, dbName: string): Promise<{
        infrastructure: string
        customResource: string
    }> {
        const sanitizedStackName = this.sanitizeName(stackName)

        const [infrastructure, customResource] = await Promise.all([
            this.renderFragment('database/infrastructure.mustache', {
                stackName: sanitizedStackName,
            }),
            this.renderFragment('database/custom-resource.mustache', {
                stackName: sanitizedStackName,
                dbName: this.sanitizeDbName(dbName)
            })
        ])

        return { infrastructure, customResource }
    }
}