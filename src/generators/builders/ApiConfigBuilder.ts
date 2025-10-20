import { Builder } from './Builder.js'
import { ApiDefinition } from '../../models/ApiDefinition.js'

export class ApiConfigBuilder extends Builder {

    async build(api: ApiDefinition): Promise<{
        apiKeys: string,
        usagePlan: string,
    }> {
        const [apiKeys, usagePlan] = await Promise.all([
            this.buildApiKeys(api),
            this.buildUsagePlan(api),
        ])

        return { apiKeys, usagePlan }
    }

    private async buildApiKeys(api: ApiDefinition): Promise<string> {
        if (!api.config.apiKeys?.enabled) return ''
        const sanitizedStackName = this.sanitizeName(api.name)

        const clients = api.config.apiKeys.clients || [
            { name: `${sanitizedStackName}-default`, description: `Default ${sanitizedStackName} client` }
        ];
        const stackName = this.getStackName(api)
        return (await this.mapToFragments(
            clients,
            async (client, index) => this.renderFragment('api/api-key.mustache', {
                index,
                stackName,
                name: client.name,
                description: client.description || client.name
            })
        )).join('\n')
    }

    private async buildUsagePlan(api: ApiDefinition): Promise<string> {
        const sanitizedStackName = this.sanitizeName(api.name)

        const clients = api.config.apiKeys?.clients || [
            { name: `${sanitizedStackName}-default`, description: `Default ${sanitizedStackName} client` }
        ];
        const stackName = this.getStackName(api);

        const globalThrottling = api.config.throttling || undefined;
        const perMethodThrottles = api.routes.map((route, i) => {
            const t = route.throttling;
            if (!t) return null;
            return {
                methodVar: `method${i}`,
                rateLimit: t.rateLimit,
                burstLimit: t.burstLimit,
            };
        }).filter(Boolean);

        const hasPerMethodThrottling = perMethodThrottles.length > 0;

        const defaultThrottle = globalThrottling || (hasPerMethodThrottling ? {
            rateLimit: 100,
            burstLimit: 200
        } : undefined);

        return await this.renderFragment('api/usage-plan.mustache', {
            stackName,
            apiName: api.name,
            keyIndices: clients.map((_, i) => ({ index: i })),
            defaultThrottle: defaultThrottle,
            perMethodThrottles: perMethodThrottles,
        });
    }
}
