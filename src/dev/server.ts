import http from 'http'
import { parse } from 'url'
import path from 'path'
import { loadConfig } from '../internal/loadConfig.js'
import { emulateEvent } from './emulator.js'
import { buildRouter } from './router.js'
import { launchDockerPostgres, stopDockerPostgres } from './db/docker.js'
import { runMigrations } from './db/migrate.js'

const PORT = 3000

async function main() {
    console.log('Starting dev server...')
    const api = await loadConfig()
    const config = api.config
    const router = buildRouter(config)

    if (config.database) {
        console.log('Launching local Postgres container...')
        await launchDockerPostgres()
        console.log('Running database migrations...')
        await runMigrations(config.database)
    }

    const server = http.createServer(async (req, res) => {
        const method = req.method || 'GET'
        const url = parse(req.url || '', true)
        if (req.method === 'OPTIONS') {
            const origin = req.headers.origin;
            res.writeHead(204, {
                'Access-Control-Allow-Origin': origin || '*',
                'Access-Control-Allow-Headers': 'Content-Type,Authorization,Accept,X-Return-URL',
                'Access-Control-Allow-Methods': 'GET,OPTIONS,POST,PUT,DELETE',
            });
            return res.end();
        }


        const match = router.match(url.pathname || '', method)

        if (!match) {
            res.writeHead(404)
            return res.end('Not found')
        }

        console.log(`Matched ${method} ${url.pathname} to ${match.lambdaPath}`)

        console.log(match.params)

        const event = await emulateEvent(req, match.params, {
            domainName: "localhost:3000",
            stage: "",
            resourcePath: match.lambdaPath || req.url
        });
        const lambdaFile = path.resolve(process.cwd(), match.lambdaPath)
        let mod: any
        try {
            mod = await import(lambdaFile)
        } catch (e) {
            console.error(`Error importing handler for ${lambdaFile}`, e)
            res.writeHead(500)
            return res.end('Failed to import lambda')
        }

        let result: any
        try {
            result = await mod.main(event, {})
        } catch (e) {
            console.error(`Error running handler for ${lambdaFile}`, e)
            res.writeHead(500)
            return res.end('Handler error')
        }

        const headers = result.headers || {}

        const origin = req.headers.origin;
        if (origin && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) {
            headers['Access-Control-Allow-Origin'] = origin;
        } else {
            headers['Access-Control-Allow-Origin'] = '*';
        }
        headers['Access-Control-Allow-Headers'] = 'Content-Type,Authorization,Accept,X-Return-URL';
        headers['Access-Control-Allow-Methods'] = 'GET,OPTIONS,POST,PUT,DELETE';

        if (!headers['content-type'] && !headers['Content-Type']) {
            headers['Content-Type'] = 'application/json'
        }
        res.writeHead(result.statusCode || 200, headers)
        res.end(typeof result.body === 'string' ? result.body : JSON.stringify(result.body))
    })

    server.listen(PORT, () => {
        console.log(`Dev server listening at http://localhost:${PORT}`)
    })

    process.on('SIGINT', async () => {
        console.log('\nCleaning up...')
        await stopDockerPostgres()
        process.exit(0)
    })
}

main().catch((err) => {
    console.error('Failed to start dev server:', err)
    process.exit(1)
})
