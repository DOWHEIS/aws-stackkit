import fs from 'fs'
import path from 'path'
import type {ProcessedApiConfig} from '../api/types.js'
import {PathResolver} from "../internal/PathResolver.js";

type MatchResult = { lambdaPath: string; params: Record<string,string> }
type RouteEntry  = {
    method: string;
    matcher: RegExp;
    keys: (string | null)[];
    getLambdaPath: () => string;
};
const paths = new PathResolver(import.meta.url)

function resolveIndexForRoute(routeName: string): string {
    const resolved = paths.user(`.cdk_dev/wrapped/${routeName}`)
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
        throw new Error(`Missing folder for route "${routeName}" at ${resolved}`)
    }

    // internal routes are never versioned
    if (routeName.startsWith('__internal__/')) {
        const idx = path.join(resolved, 'index.ts')
        if (!fs.existsSync(idx)) {
            throw new Error(`Missing static index.ts for internal route at ${idx}`)
        }
        return idx
    }

    // user routes: find versioned subdirs
    const dirs = fs.readdirSync(resolved)
        .map(name => {
            const full = path.join(resolved, name)
            return fs.statSync(full).isDirectory() ? name : null
        })
        .filter((n): n is string => Boolean(n))

    if (dirs.length === 0) {
        throw new Error(`No versioned directories in ${resolved}`)
    }

    dirs.sort((a, b) => {
        const ta = parseInt(a.split('.')[0], 10)
        const tb = parseInt(b.split('.')[0], 10)
        return ta - tb
    })

    const latest = dirs[dirs.length - 1]
    const indexPath = path.join(resolved, latest, 'index.ts')
    if (!fs.existsSync(indexPath)) {
        throw new Error(`Missing index.ts in ${path.join(resolved, latest)}`)
    }
    return indexPath
}

export function buildRouter(config: ProcessedApiConfig) {
    const routes: RouteEntry[] = (config.routes || []).map((r) => {
        const routeName = r.lambda.includes("__internal__")
            ? r.lambda.replace(/^.*__internal__\//, "__internal__/")
            : path.basename(r.lambda, path.extname(r.lambda));

        const getLambdaPath = () => resolveIndexForRoute(routeName);

        const parts    = r.path.split("/").filter(Boolean);
        const keys     = parts.map((p) => (p.startsWith("{") ? p.slice(1, -1) : null));
        const matcher  = new RegExp(
            "^/" +
            parts
                .map((p) => (p.startsWith("{") ? "([^/]+)" : p))
                .join("/") +
            "$"
        );

        return { method: r.method, matcher, keys, getLambdaPath };
    });

    if ((config.routes || []).some((r) => (r as any).auth?.type === "sso")) {
        for (const [pathRe, dirName] of [
            [/^\/auth\/prelogin$/, "__internal__/auth_login"],
            [/^\/auth\/approve$/, "__internal__/auth_approve"],
        ] as const) {
            routes.push({
                method: "GET",
                matcher: pathRe,
                keys: [],
                getLambdaPath: () => resolveIndexForRoute(dirName),
            });
        }
    }

    return {
        match(url: string, method: string): MatchResult | null {
            for (const r of routes) {
                if (r.method !== method) continue;
                const m = url.match(r.matcher);
                if (!m) continue;

                const params: Record<string, string> = {};
                let idx = 1;
                for (const key of r.keys) {
                    if (key) params[key] = m[idx++];
                }
                return { lambdaPath: r.getLambdaPath(), params };
            }
            return null;
        },
    };
}
