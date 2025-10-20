import { APIGatewayProxyEvent } from "aws-lambda";

interface BaseRouteConfig {
    path: string
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
    lambda: string | Function
    environment?: Record<string, string>
    throttling?: {
        rateLimit?: number
        burstLimit?: number
    }
    memory?: number
    timeout?: number
}

type ApiKeyAuth = { type: 'apiKey'; required?: boolean }

export type RouteConfig<ApiKeysEnabled = any> = BaseRouteConfig & {
    auth?: ApiKeysEnabled extends true
        ? ApiKeyAuth
        : never
}

export interface ApiConfig {
    name: string
    description?: string
    cors?: boolean
    database?: DatabaseConfig
    environment?: Record<string, string>
    routes?: RouteConfig[]
    throttling?: {
        rateLimit?: number
        burstLimit?: number
    }
    apiKeys?: {
        enabled: boolean
        clients?: Array<{
            name: string
            description?: string
        }>
    }
}

type ApiKeysEnabled<T extends ApiConfig> = T['apiKeys'] extends { enabled: true } ? true : false

export type InferRouteConfig<T extends ApiConfig> = RouteConfig<ApiKeysEnabled<T>>

export interface ProcessedRouteConfig extends Omit<BaseRouteConfig, 'lambda'> {
    lambda: string
    auth?: ApiKeyAuth
}

export interface ProcessedApiConfig extends ApiConfig {
    routes?: ProcessedRouteConfig[]
}

export type DatabaseConfig = {
    name: string
    migrationsPath?: string
}

export interface AuthenticatedApiEvent extends APIGatewayProxyEvent {
    ssoUser?: Record<string, string>
    apiKeyName?: string
}

type UpperAlpha = "A" | "B" | "C" | "D" | "E" | "F" | "G" |
    "H" | "I" | "J" | "K" | "L" | "M" | "N" |
    "O" | "P" | "Q" | "R" | "S" | "T" | "U" |
    "V" | "W" | "X" | "Y" | "Z";
type LowerAlpha = Lowercase<UpperAlpha>;

export type ValidApiName<T extends string> =
    T extends `${UpperAlpha | LowerAlpha}${string}` ? T : never;


