type HandlerFn = (event: any, context: any) => Promise<any>;

interface WrapOptions {
    auth: {
        type: 'apiKey',
        required?: boolean;
    } | boolean;
}

function normalizeHeaders(headers: Record<string, any> = {}) {
    const result: Record<string, string> = {};
    for (const [k, v] of Object.entries(headers)) {
        result[k.toLowerCase()] = v;
    }
    return result;
}

export function wrapHandler(handler: HandlerFn, options: WrapOptions): HandlerFn {
    return async (event, context) => {
        const authType = typeof options.auth === "boolean" ? options.auth : options.auth?.type;

        if (authType === 'apiKey') {
            if(process.env.SDK_DEV_SERVER === "1") {
                const authRequiredValue = typeof options.auth === "boolean" ? options.auth : options.auth?.required
                const headers = normalizeHeaders(event.headers);
                if(!headers['x-api-key'] && authRequiredValue === true) {
                    return {
                        statusCode: 401,
                        headers: {
                            'Content-Type': 'application/json',
                            'Access-Control-Allow-Origin': '*',
                            'Access-Control-Allow-Headers': 'Content-Type,Authorization,Accept,X-Return-URL',
                            'Access-Control-Allow-Methods': 'GET,OPTIONS,POST,PUT,DELETE',
                        },
                        body: JSON.stringify({
                            error: 'Unauthorized',
                            message: 'API key is still required in development mode, use the x-api-key header with any value to bypass this check',
                        }),
                    }
                }
            }
            //do nothing in prod, api key validation is handled by the API Gateway
        }

        const response = await handler(event, context);

        // Always ensure CORS headers are present
        response.headers = {
            ...response.headers,
            'Access-Control-Allow-Origin':
                response.headers?.['Access-Control-Allow-Origin'] || '*',
            'Access-Control-Allow-Headers':
                response.headers?.['Access-Control-Allow-Headers'] ||
                'Content-Type,Authorization,Accept,X-Return-URL',
            'Access-Control-Allow-Methods':
                response.headers?.['Access-Control-Allow-Methods'] ||
                'GET,OPTIONS,POST,PUT,DELETE',
        };

        return response;
    };
}


