import type { ApiConfig } from '../api/types.js'

type MatchResult = { lambdaPath: string; params: Record<string, string> }

export function buildRouter(config: ApiConfig) {
    let routes = (config.routes || []).map((r) => {
        let lambdaBase: string
        if (r.lambda.includes('__internal__')) {
            lambdaBase = r.lambda
        } else {
            lambdaBase = r.lambda
                .split('/')
                .pop()!
                .replace(/\.[^.]+$/, '')
        }

        let lambdaPath = r.lambda.includes('__internal__')
            ? `cdk/wrapped/${lambdaBase}/index.ts`
            : `cdk/wrapped/${lambdaBase}/index.ts`;

        const parts = r.path.split('/').filter(Boolean)
        const keys = parts.map(p => p.startsWith('{') ? p.slice(1, -1) : null)
        const matcher = new RegExp(
            '^/' + parts.map(p => p.startsWith('{') ? '([^/]+)' : p).join('/') + '$'
        )
        return { method: r.method, matcher, keys, lambdaPath }
    })

    const hasAuth = (config.routes || []).some(r => (r as any).auth)
    if (hasAuth) {
        routes = [
            ...routes,
            {
                method: 'GET',
                matcher: /^\/auth\/prelogin$/,
                keys: [],
                lambdaPath: 'cdk/wrapped/__internal__/auth_login/index.ts',
            },
            {
                method: 'GET',
                matcher: /^\/auth\/approve$/,
                keys: [],
                lambdaPath: 'cdk/wrapped/__internal__/auth_approve/index.ts',
            }
        ]
    }

    return {
        match(path: string, method: string): MatchResult | null {
            for (const r of routes) {
                if (r.method !== method) continue
                const m = path.match(r.matcher)
                if (!m) continue
                const params: Record<string, string> = {}
                let groupIdx = 1
                for (const k of r.keys) {
                    if (k) {
                        params[k] = m[groupIdx]
                        groupIdx++
                    }
                }

                return { lambdaPath: r.lambdaPath, params }
            }
            return null
        }
    }
}
