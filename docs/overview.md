# AWS Stackkit Technical Documentation

## System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER INTERFACE                          │
│  (CLI Commands: scaffold, deploy, dev, migrate, core:init)      │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                     CONFIGURATION LAYER                         │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐          │
│  │ api.config.ts│─▶│ ImportParser │─▶│ConfigurableApi│          │
│  └──────────────┘  └──────────────┘  └──────┬────────┘          │
│                                             │                   │
│                                             ▼                   │
│                                    ┌──────────────────┐         │
│                                    │  ApiDefinition   │         │
│                                    └────────┬─────────┘         │
└─────────────────────────────────────────────┼───────────────────┘
                                              │
                  ┌───────────────────────────┼───────────────┐
                  │                           │               │
                  ▼                           ▼               ▼
        ┌─────────────────┐       ┌──────────────────┐    ┌─────────────┐
        │ PRODUCTION MODE │       │ DEVELOPMENT MODE │    │ MIGRATIONS  │
        └─────────────────┘       └──────────────────┘    └─────────────┘
                  │                           │                   │
                  ▼                           ▼                   ▼
    ┌──────────────────────┐    ┌────────────────────┐  ┌──────────────┐
    │   Code Generation    │    │    Dev Server      │  │ DB Management│
    │                      │    │                    │  │              │
    │ • ApiBuilder         │    │ • HTTP Server      │  │ • migrate.ts │
    │ • Generators         │    │ • Router           │  │ • docker.ts  │
    │ • Template Service   │    │ • Module Loader    │  │ • RDS API    │
    │ • Dependency Bundler │    │ • HMR System       │  │              │
    └──────────┬───────────┘    └──────────┬─────────┘  └──────────────┘
               │                           │
               ▼                           ▼
    ┌──────────────────┐      ┌─────────────────────┐
    │   CDK Stack      │      │  Local API Gateway  │
    │   (AWS Deploy)   │      │  + Hot Reload       │
    └──────────────────┘      └─────────────────────┘
```

---

## Module Breakdown

### 1. Configuration & Parsing Module

**Purpose**: Transform user's TypeScript config into validated internal model

```
api.config.ts
    │
    ├─▶ ImportParser.parseImports()
    │   │ • Uses TypeScript Compiler API
    │   │ • Creates map: function name → file path
    │   │ • Only handles default imports from local files
    │   └─▶ Map<string, string>
    │
    ├─▶ ConfigurableApi (wrapper)
    │   │ • Applies Zod validation schema
    │   │ • API (addRoute, withDatabase)
    │   └─▶ Validated config object
    │
    └─▶ ApiDefinition.from(config)
        │ • Resolves function references to paths using ImportMap
        │ • Creates ProcessedRouteConfig[]
        │ • Validates database, routes, auth settings
        └─▶ ApiDefinition instance
```

**Key Files**:
- `ConfigurableApi.ts` - User-facing wrapper with validation
- `ImportParser.ts` - TSX-based import resolution
- `ApiDefinition.ts` - Internal immutable model
- `schemas.ts` - Zod validation rules
- `loadConfig.ts` - Dynamic import with TSX registration

**Data Flow**:
```
Function References     ImportMap           Resolved Paths
    handler()      →  {handler: './handlers/hello.ts'}  →  ProcessedRouteConfig
    getUser()      →  {getUser: './handlers/users.ts'}  →  { lambda: './handlers/users.ts' }
```

---

### 2. Code Generation Module

**Purpose**: Generate CDK infrastructure and Lambda wrappers

```
ApiBuilder
    │
    ├─▶ CdkStackGenerator
    │   │ • Uses LambdaBuilder, RouteBuilder, DatabaseBuilder
    │   │ • Renders stack.mustache template
    │   └─▶ lib/Stack.ts
    │
    ├─▶ CdkAppGenerator
    │   └─▶ bin/app.ts
    │
    ├─▶ PackageJsonGenerator
    │   └─▶ package.json
    │
    ├─▶ HandlerWrapperGenerator
    │   │ • For each route, creates wrapped/[routeName]/
    │   │ • Calls DependencyBundler
    │   │ • Generates index.ts that imports wrapHandler
    │   └─▶ wrapped/hello/index.ts
    │
    └─▶ HelpersGenerator
        └─▶ helpers/wrapHandler.ts (CORS, auth)
```

**Builder Pattern** (Fragment Producers):
```
Builder (abstract)
    │
    ├─▶ LambdaBuilder
    │   └─▶ Produces: Lambda function declarations
    │       • Aggregates env vars (global + route + DB)
    │       • Adds VPC config if database exists
    │       • Injects memory/timeout settings
    │
    ├─▶ RouteBuilder
    │   └─▶ Produces: API Gateway resource tree + methods
    │       • Tracks resourceMap for path segments
    │       • Generates addResource() calls
    │       • Adds method with throttling/auth options
    │
    ├─▶ DatabaseBuilder
    │   └─▶ Produces: VPC imports + RDS cluster + CustomResource
    │
    └─▶ ApiConfigBuilder
        └─▶ Produces: API Keys + Usage Plan
```

**Template System**:
```
TemplateService
    │
    └─▶ Mustache templates in src/templates/
        │
        ├─▶ stack.mustache (main CDK stack)
        ├─▶ app.mustache (CDK app entrypoint)
        │
        └─▶ fragments/
            ├─▶ lambda/declaration.mustache
            ├─▶ routes/method.mustache
            ├─▶ database/infrastructure.mustache
            └─▶ api/usage-plan.mustache
```

---

### 3. Dependency Bundling Module

**Purpose**: Analyze imports and bundle code for Lambda deployment

```
HandlerWrapperGenerator
    │
    └─▶ DependencyBundler.bundleHandler()
        │
        ├─▶ DependencyAnalyzer.analyzeDependencies()
        │   │
        │   ├─▶ extractImportsFromFile()
        │   │   │ • Uses TypeScript Compiler API
        │   │   │ • Handles: import, require, dynamic import()
        │   │   │ • Tracks importedItems (named exports)
        │   │   └─▶ Array<{spec, importedItems, subpath?}>
        │   │
        │   ├─▶ resolveLocalImport()
        │   │   │ • Uses ts.resolveModuleName()
        │   │   └─▶ absolute file path
        │   │
        │   └─▶ resolveNpmDependencies()
        │       │ • Detects private packages (check npmjs.org)
        │       │ • For private: analyzeRequiredFiles()
        │       │   └─▶ Traces dependencies, finds export sources
        │       └─▶ NpmDependency[]
        │
        ├─▶ Copy local dependencies to shared/
        │   └─▶ Handles name conflicts with counters
        │
        ├─▶ Copy private packages to shared/[packageName]/
        │   │ • Selective copy using requiredFiles[]
        │   │ • Flattens directory structure
        │   └─▶ Creates pathMapping for imports
        │
        └─▶ updateImports()
            │ • Rewrites import paths to ../shared/
            │ • Handles subpath imports (e.g., pkg/db)
            └─▶ Updated handler with correct paths
```

**Example Transformation**:
```
// Original handler
import { selectAll } from 'aws-stackkit/db'
import myHelper from './helpers/util'

// After bundling
import { selectAll } from '../shared/aws-stackkit/db'
import myHelper from '../shared/util'
```

---

### 4. Development Server Module

**Purpose**: Local API Gateway emulation with hot module reload

```
dev command
    │
    ├─▶ scaffoldDev()
    │   └─▶ Generates .cdk_dev/ with wrapped handlers
    │
    ├─▶ spawn('tsx', ['--inspect=9229', 'dev/server.ts'])
    │   │
    │   └─▶ Dev Server Process
    │       │
    │       ├─▶ HTTP Server (port 3000)
    │       │   │ • Parses request → emulateEvent()
    │       │   │ • Router matches path/method → lambdaPath
    │       │   │ • IsolatedModuleLoader loads handler
    │       │   └─▶ Response with CORS headers
    │       │
    │       └─▶ HmrIpcServer (port 3001)
    │           └─▶ Listens for reload messages
    │
    ├─▶ Chokidar file watcher
    │   │ • Watches **/*.ts, **/*.sql
    │   │ • Debounces changes (500ms)
    │   │ • Ignores node_modules, .cdk_dev, etc.
    │   └─▶ On change: incrementalScaffold()
    │
    └─▶ HmrIpcClient
        └─▶ Sends reload signal to server

```

**Hot Reload Flow**:
```
File saved
    ↓
Chokidar detects change (awaitWriteFinish)
    ↓
Debounce timer (500ms)
    ↓
incrementalScaffold(changedFiles)
    ├─▶ If api.config.ts changed: full rebuild
    └─▶ Else: rebuild affected routes only
    ↓
HmrIpcClient.sendReload(files)
    ↓
HmrIpcServer receives message
    ↓
IsolatedModuleLoader.clearCache(files)
    ├─▶ Updates moduleTimestamps
    ├─▶ Clears require.cache for changed files
    └─▶ Clears wrapped/ handlers
    ↓
Next request: loadHandler() with ?t=timestamp
    ↓
Handler reloaded with fresh code
```

**IsolatedModuleLoader Details**:
```javascript
// Prevents cache hits
const timestamp = moduleTimestamps.get(absPath) || Date.now()
const url = pathToFileURL(absPath).href + `?t=${timestamp}`

// Dynamic import with retry logic
await import(url)  // Retries 10 times with file existence check

// Isolates environment between requests
async runIsolated(fn, evt, ctx) {
    const originalEnv = { ...process.env }
    try { return await fn(evt, ctx) }
    finally { process.env = originalEnv }
}
```

---

### 5. Database Module

**Purpose**: Manage PostgreSQL in development and production

```
Development (Docker):
    launchDockerPostgres()
        ├─▶ docker-compose up -d
        ├─▶ Wait for health check
        └─▶ Container: sdk_dev_pg on port 5432

    runMigrations()
        ├─▶ Connect to localhost:5432
        ├─▶ Create _migrations table
        ├─▶ Read *.sql files from migrations/
        ├─▶ For each: check _migrations, run if new
        └─▶ Split on @@rollback, execute only UP section

Production (AWS):
    CoreInfraStack (one-time setup)
        ├─▶ VPC (10.50.0.0/16)
        ├─▶ Aurora Serverless v2 cluster
        ├─▶ Secrets Manager for credentials
        ├─▶ Lambda for database creation
        └─▶ Exports to SSM parameters

    Generated Stack
        ├─▶ Imports VPC, cluster, secret from SSM
        ├─▶ CustomResource calls createDb Lambda
        │   └─▶ Executes: CREATE DATABASE "dbname"
        └─▶ Lambdas get DB_SECRET_ARN, DB_NAME env vars

    migrate command
        ├─▶ Uses RDS Data API (no direct connection)
        ├─▶ Reads SSM parameters for cluster ARN
        └─▶ Executes migrations via ExecuteStatementCommand
```

**Migration Format**:
```sql
-- UP section (always executed)
CREATE TABLE users (id serial PRIMARY KEY);

-- @@rollback
-- Rollback section (only for migrate:rollback)
DROP TABLE users;
```

---

### 6. Core Infrastructure Module

**Purpose**: Shared AWS resources for all Stackkit projects

```
core:init command
    │
    ├─▶ Scaffold core-infra/ project
    │   └─▶ Copies src/core-infra/ to ~/core-stackkit-infra/
    │
    ├─▶ npm install
    │
    └─▶ cdk deploy CoreInfraStack
        │
        ├─▶ VPC with private + public subnets
        │
        ├─▶ Aurora Postgres Cluster
        │   ├─▶ Serverless v2 (0.5-4 ACU)
        │   └─▶ Enable Data API
        │
        ├─▶ Secret (credentials)
        │
        ├─▶ Lambda: createDb.ts
        │   └─▶ CustomResource provider
        │       │ • Receives DB_NAME in properties
        │       │ • Executes: CREATE DATABASE IF NOT EXISTS
        │       └─▶ Returns PhysicalResourceId
        │
        └─▶ CloudFormation Exports → SSM Parameters
            ├─▶ /core-stackkit-infra/vpc-id
            ├─▶ /core-stackkit-infra/cluster-arn
            ├─▶ /core-stackkit-infra/db-secret-arn
            └─▶ /core-stackkit-infra/create-db-service-token
```

**Why Shared Cluster?**
- Cost efficient (one Aurora cluster for all projects)
- Each project gets isolated database via CREATE DATABASE
- Shared VPC, secrets, security groups

---

## Command Flows

### scaffold

```
1. loadConfig() → ApiDefinition
2. ApiBuilder.generate(outputDir='cdk')
    ├─▶ All generators run in sequence
    └─▶ HandlerWrapperGenerator bundles dependencies
3. npm install in cdk/
4. Format with Prettier
```

### deploy

```
1. loadConfig() → check database name changes
2. Read .sdkmeta/last-deployed.json
3. If destructive changes: require --force
4. cd cdk && npx cdk deploy
5. Save config to .sdkmeta/last-deployed.json
```

### dev

```
1. scaffoldDev() → .cdk_dev/
2. Spawn dev server process (tsx server.ts)
3. Start Chokidar watcher
4. Start HmrIpcClient
5. If database: launch Docker + run migrations
6. Server ready on http://localhost:3000
```

### migrate (production)

```
1. loadConfig()
2. checkCoreInfra() → read SSM parameters
3. Create _migrations table (via RDS Data API)
4. For each *.sql in migrations/:
    ├─▶ Check if already run
    ├─▶ Split on @@rollback
    └─▶ Execute UP section
5. Record in _migrations table
```

---

## Key Design Patterns

### 1. Builder Pattern (Code Generation)
Builders (LambdaBuilder, RouteBuilder, etc.) produce Mustache template fragments that are assembled into final CDK code.

### 2. Template Method (Generators)
All generators implement `generate(api, outputDir)`. ApiBuilder orchestrates execution order.

### 3. Import Map Pattern
Function references resolved to file paths via static ImportMap set before ApiDefinition creation.

### 4. Hot Module Replacement
Custom HMR using IPC + module cache invalidation + dynamic imports with timestamps.

---

## File Organization

```
src/
├── api/                    # User-facing API
│   ├── ConfigurableApi.ts
│   ├── schemas.ts
│   ├── types.ts
│   └── db.ts              # Runtime DB client
│
├── cli/                   # Command implementations
│   ├── scaffold.ts
│   ├── deploy.ts
│   ├── dev.ts
│   ├── migrate.ts
│   └── ...
│
├── core/                  # Core orchestration
│   └── ApiBuilder.ts
│
├── generators/            # Code generators
│   ├── Generator.ts       (interface)
│   ├── CdkStackGenerator.ts
│   ├── HandlerWrapperGenerator.ts
│   └── builders/          # Fragment producers
│       ├── LambdaBuilder.ts
│       ├── RouteBuilder.ts
│       └── ...
│
├── services/              # Utilities
│   ├── TemplateService.ts
│   ├── DependencyAnalyzer.ts
│   ├── DependencyBundler.ts
│   └── Logger.ts
│
├── dev/                   # Dev server
│   ├── server.ts
│   ├── router.ts
│   ├── emulator.ts
│   ├── IsolatedModuleLoader.ts
│   ├── HmrIPCHandler.ts
│   └── db/
│
├── internal/              # Internal utilities
│   ├── loadConfig.ts
│   ├── ImportParser.ts
│   ├── PathResolver.ts
│   └── ...
│
├── models/
│   └── ApiDefinition.ts
│
├── helpers/               # Runtime helpers (copied to cdk/)
│   └── wrapHandler.ts
│
├── templates/             # Mustache templates
│   ├── stack.mustache
│   └── fragments/
│
└── core-infra/            # Shared AWS infrastructure
    └── lib/core-infra-stack.ts
```

---

## Technical Deep Dives

### How Import Resolution Works

1. **Parse Phase** (ImportParser):
   ```typescript
   // Scans api.config.ts with TS Compiler API
   import handler from './handlers/hello'
   
   // Creates map entry
   { handler: './handlers/hello.ts' }
   ```

2. **Resolution Phase** (ApiDefinition):
   ```typescript
   routes: [{ 
     path: '/hello', 
     lambda: handler  // Function reference
   }]
   
   // Looks up in ImportMap
   → lambda: './handlers/hello.ts'  // String path
   ```

3. **Why This Approach?**
    - Allows users to reference functions naturally
    - Type-safe in user code (TypeScript validates imports)
    - Converts to serializable paths for code generation

### How Dependency Bundling Works

1. **Analyze Imports**:
    - Walk entry file with TS Compiler API
    - Recursively follow local imports
    - Collect npm package names

2. **Classify Dependencies**:
   ```typescript
   // Check if package is private
   fetch('https://registry.npmjs.org/pkg')
   → 404: private, needs bundling
   → 200: public, add to package.json
   ```

3. **Selective Bundling** (Private Packages):
    - Parse package.json exports field
    - Trace which files export the imported symbols
    - Copy only required files to shared/
    - Flatten directory structure (avoid deep nesting)

4. **Path Rewriting**:
   ```typescript
   // Original
   import { x } from 'private-pkg/subpath'
   
   // Rewritten
   import { x } from '../shared/private-pkg/subpath'
   ```

### How Hot Reload Works

1. **File Watch**: Chokidar detects .ts file changes
2. **Debounce**: Wait 500ms for multiple rapid saves
3. **Rebuild**: incrementalScaffold() regenerates affected handlers
4. **IPC Signal**: Client sends list of changed files to server
5. **Cache Clear**: Server clears Node's require cache + moduleTimestamps
6. **Reload**: Next request re-imports with `?t=timestamp` query

**Why IPC Instead of HTTP?**
- HTTP would require server to expose endpoint
- IPC is local-only
- It's lightweight and fast for dev workflow

### How API Gateway Emulation Works

```typescript
// Transform Express-like request to API Gateway event
emulateEvent(req, pathParams) {
  return {
    httpMethod: 'GET',
    path: '/users/123',
    pathParameters: { id: '123' },
    queryStringParameters: { limit: '10' },
    headers: { 'content-type': 'application/json' },
    body: '...',
    requestContext: { ... },  // Mock AWS context
  }
}
```

Handler receives identical event structure locally and in AWS.

---

## Environment Differences

| Feature | Development (dev) | Production (deploy) |
|---------|-------------------|---------------------|
| Output Dir | `.cdk_dev/` | `cdk/` |
| Database | Docker Postgres | Aurora Serverless |
| Migrations | Direct SQL via pg | RDS Data API |
| Auth | X-Api-Key bypass | API Gateway validation |
| Hot Reload | Yes (IPC + cache clear) | No |
| Bundling | Skip local copy | Full bundle + rewrite |
| Handler Path | Points to source | Copies to wrapped/ |

---

## Extension Points

### Adding a New Generator

1. Implement `Generator` interface
2. Add to `ApiBuilder.createGenerators()`
3. Create template in `src/templates/`

### Adding a New CLI Command

1. Add command in `bin.ts`
2. Implement in `src/cli/[command].ts`
3. Use `loadConfig()` for API definition

### Adding a New Auth Type

1. Update `schemas.ts` with new auth type
2. Add validation in `ApiConfigBuilder`
3. Update `wrapHandler.ts` for runtime check
4. Generate auth resources in generator

### Supporting New Runtime

1. Update `LambdaBuilder` to support new runtime
2. Update handler wrapper template
3. Adjust bundling for runtime-specific imports

---
