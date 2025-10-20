import {z} from "zod";

export const ApiNameSchema = z.string()
    .min(1, 'API Name Is required')
    .max(40, 'API Name must be 40 characters or less')
    .regex(/^[a-zA-Z][a-zA-Z0-9]*$/, 'API name must start with a letter and contain only letters and numbers')


export const DatabaseNameSchema = z.string()
    .min(1, 'Database name is required')
    .max(63, 'Database name must be 63 characters or less')
    .regex(/^[a-z][a-z0-9_]*$/, 'Database name must start with a letter and contain only lowercase letters, numbers, and underscores')

export const RoutePathSchema = z.string()
    .min(1, 'Path is required')
    .regex(/^\//, 'Path must start with /')
    .regex(/^[a-zA-Z0-9\/_{}:-]+$/, 'Path contains invalid characters')

export const MemorySchema = z.number()
    .int('Memory must be an integer')
    .min(128, 'Memory must be at least 128 MB')
    .max(10240, 'Memory cannot exceed 10240 MB')
    .refine(
        val => [128, 192, 256, 320, 384, 448, 512, 576, 640, 704, 768, 832, 896, 960, 1024, 1088, 1152, 1216, 1280, 1344, 1408, 1472, 1536, 1600, 1664, 1728, 1792, 1856, 1920, 1984, 2048, 2112, 2176, 2240, 2304, 2368, 2432, 2496, 2560, 2624, 2688, 2752, 2816, 2880, 2944, 3008, 3072].includes(val) || (val > 3072 && val <= 10240 && val % 1024 === 0),
        'Memory must be a valid Lambda memory size'
    )

export const TimeoutSchema = z.number()
    .int('Timeout must be an integer')
    .min(1, 'Timeout must be at least 1 second')
    .max(900, 'Timeout cannot exceed 15 minutes (900 seconds)')

const ThrottlingSchema = z.object({
    rateLimit: z.number().int().positive().optional(),
    burstLimit: z.number().int().positive().optional(),
})

const DatabaseConfigSchema = z.object({
    name: DatabaseNameSchema,
    migrationsPath: z.string().optional(),
})

const ApiKeyClientSchema = z.object({
    name: z.string()
        .min(1, 'API key name is required')
        .max(50, 'API key name must be 50 characters or less')
        .regex(/^[a-zA-Z0-9_-]+$/, 'API key name can only contain letters, numbers, underscores, and hyphens'),
    description: z.string().max(200).optional(),
})

const ApiKeysConfigSchema = z.object({
    enabled: z.boolean(),
    clients: z.array(ApiKeyClientSchema).optional(),
})

const ApiKeyAuthSchema = z.object({
    type: z.literal('apiKey'),
    required: z.boolean().optional().default(true),
})

const BaseRouteSchema = z.object({
    path: RoutePathSchema,
    method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']),
    lambda: z.custom<Function>(),
    environment: z.record(z.string(), z.string()).optional(),
    throttling: ThrottlingSchema.optional(),
    memory: MemorySchema.optional(),
    timeout: TimeoutSchema.optional(),
    // middleware: z.array(z.custom<Function>()).optional(),
})

const RouteWithAuthSchema = BaseRouteSchema.extend({
    auth: ApiKeyAuthSchema.optional(),
})

export const ProcessedRouteSchema = BaseRouteSchema.extend({
    lambda: z.string(),
})

export const ApiConfigSchema = z.object({
    name: ApiNameSchema,
    description: z.string().max(200).optional(),
    cors: z.boolean().optional().default(true),
    database: DatabaseConfigSchema.optional(),
    environment: z.record(z.string(), z.string()).optional(),
    routes: z.array(RouteWithAuthSchema).default([]).optional(),
    throttling: ThrottlingSchema.optional(),
    apiKeys: ApiKeysConfigSchema.optional(),
})

export const createApiConfigSchema = <T extends { apiKeys?: { enabled: boolean } }>(config: T) => {
    const baseSchema = ApiConfigSchema

    if (config.apiKeys?.enabled === false) {
        return baseSchema.refine(
            (val) => {
                return !val.routes?.some(route => route.auth?.type === 'apiKey')
            },
            {
                message: "Cannot use 'apiKey' authentication when apiKeys.enabled is false",
                path: ['routes'],
            }
        )
    }

    return baseSchema
}
