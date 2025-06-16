import {APIGatewayProxyEvent} from "aws-lambda";

export interface RouteConfig {
    path: string
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
    lambda: string
    auth?: boolean
    environment?: Record<string, string>
}

export interface ApiConfig {
    name: string
    description?: string
    cors?: boolean
    database?: DatabaseConfig
    environment?: Record<string, string>,
    routes?: RouteConfig[],
    auth?: (event: any) => any
}


export type DatabaseConfig = {
    name: string
    migrationsPath: string
}

type ApiEvent = APIGatewayProxyEvent

interface AuthenticatedApiEvent extends APIGatewayProxyEvent {
    ssoUser: Record<string, string>
}