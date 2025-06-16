import type { IncomingMessage } from 'http'
import { parse } from 'url'

export async function emulateEvent(
    req: IncomingMessage,
    pathParams: Record<string, string>,
    opts?: {
        domainName?: string
        stage?: string
        resourcePath?: string
    }
) {
    const { pathname, query } = parse(req.url || '', true)
    const body = await getRawBody(req)

    const headers: Record<string, string> = {}
    for (const k in req.headers) {
        const v = req.headers[k]
        if (typeof v === "string") headers[k.toLowerCase()] = v
        else if (Array.isArray(v)) headers[k.toLowerCase()] = v.join(", ")
    }

    const queryStringParameters: Record<string, string> = {}
    if (query) {
        for (const k of Object.keys(query)) {
            const v = query[k]
            if (Array.isArray(v)) queryStringParameters[k] = v[0]
            else if (v != null) queryStringParameters[k] = String(v)
        }
    }

    const multiValueHeaders: Record<string, string[]> = {}
    for (const k in req.headers) {
        const v = req.headers[k]
        if (typeof v === "string") multiValueHeaders[k.toLowerCase()] = [v]
        else if (Array.isArray(v)) multiValueHeaders[k.toLowerCase()] = v
    }
    const multiValueQueryStringParameters: Record<string, string[]> = {}
    if (query) {
        for (const k of Object.keys(query)) {
            const v = query[k]
            if (Array.isArray(v)) multiValueQueryStringParameters[k] = v
            else if (v != null) multiValueQueryStringParameters[k] = [String(v)]
        }
    }

    const stage = opts?.stage ?? ''
    const domainName = opts?.domainName ?? 'localhost:3000'
    const resourcePath = opts?.resourcePath ?? pathname

    const event = {
        resource: resourcePath,
        path: pathname,
        httpMethod: req.method || 'GET',
        headers,
        multiValueHeaders,
        queryStringParameters: Object.keys(queryStringParameters).length > 0 ? queryStringParameters : null,
        multiValueQueryStringParameters: Object.keys(multiValueQueryStringParameters).length > 0 ? multiValueQueryStringParameters : null,
        pathParameters: pathParams,
        stageVariables: null,
        requestContext: {
            accountId: "dev-account",
            resourceId: "dev-resource",
            stage,
            requestId: Math.random().toString(36).slice(2),
            identity: {
                cognitoIdentityPoolId: null,
                accountId: null,
                cognitoIdentityId: null,
                caller: null,
                apiKey: null,
                sourceIp: req.socket.remoteAddress || "127.0.0.1",
                cognitoAuthenticationType: null,
                cognitoAuthenticationProvider: null,
                userArn: null,
                userAgent: headers["user-agent"] || "",
                user: null,
            },
            resourcePath,
            httpMethod: req.method || "GET",
            apiId: "dev-api",
            protocol: req.httpVersion ? `HTTP/${req.httpVersion}` : 'HTTP/1.1',
            domainName,
            domainPrefix: domainName.split('.')[0],
            requestTimeEpoch: Date.now(),
            requestTime: new Date().toISOString(),
            path: pathname,
        },
        body: body.length > 0 ? body.toString() : null,
        isBase64Encoded: false,
    }

    return event
}

function getRawBody(req: IncomingMessage): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const chunks: any[] = []
        req.on('data', chunk => chunks.push(chunk))
        req.on('end', () => resolve(Buffer.concat(chunks)))
        req.on('error', reject)
    })
}
