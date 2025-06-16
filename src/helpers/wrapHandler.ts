type HandlerFn = (event: any, context: any) => Promise<any>;

interface WrapOptions {
    auth?: (event: any) => Promise<any | null>;
}

export function wrapHandler(handler: HandlerFn, options: WrapOptions = {}): HandlerFn {
    return async (event, context) => {
        if (options.auth) {
            const user = await options.auth(event);
            if (!user) {
                return {
                    statusCode: 401,
                    body: 'Unauthorized',
                };
            }
            event.user = user;
        }

        return handler(event, context);
    };
}
