# AWS Stackkit — Developer README

> Internal contributor documentation. This explains how the SDK works under the hood, what each piece is responsible for, and where to make changes. This is not end-user facing — it’s for developers extending or maintaining Stackkit.

---

## Execution Model

- The SDK is a **CLI-driven code generator**. It reads an `api.config.ts` file, processes it into an `ApiDefinition`, and then scaffolds CDK infrastructure and handler wrappers.
- Output is a **CDK application** (in `cdk/` or `.cdk_dev/` for dev) with:
  - A `bin/` entrypoint (`app.ts`)
  - A `lib/` stack definition (`Stack.ts`)
  - Helper files, `package.json`, `tsconfig.json`, etc.
  - Wrapped Lambda handlers with dependency bundling
- For local dev, the **dev server** runs a simulated API Gateway + Lambda runtime with hot-module reload and optional Docker-based Postgres.

---

## CLI Commands (Flow of Control)

### `scaffold`
1. Calls `loadConfig` → parses `api.config.ts` and validates.
2. Creates an `ApiDefinition`.
3. Runs `ApiBuilder.generate()` which:
  - Instantiates all core generators (`CdkStackGenerator`, `CdkAppGenerator`, `PackageJsonGenerator`, etc.).
  - Each generator writes files into the output dir using `TemplateService` or direct file ops.
  - Optionally includes `AuthGenerator` if SSO is required.

### `deploy`
1. Reads last-deployed config (`.sdkmeta`).
2. Runs `cdk synth/deploy`.
3. Verifies destructive changes unless `--force` is provided.

### `migrate`
1. Launches Docker Postgres (if needed).
2. Runs migrations against the dev DB.
3. Tracks applied migrations in `_migrations` table.

### `rollback`
- Rolls back CDK files to the last known deployed configuration (`.sdkmeta/last-deployed.json`).

### `core:init`
- Deploys the **CoreInfraStack**:
  - Shared VPC
  - Aurora Postgres cluster
  - Secrets
  - CustomResource provider (Lambda for DB creation)
- Exports SSM parameters for later stacks.

### `dev`
1. Sets `SDK_DEV_SERVER=1`.
2. Starts local HTTP server (default port 3000).
3. Builds router from `api.config.ts`.
4. Launches Docker Postgres if database is defined.
5. Watches for file changes via IPC (HMR).
6. Hot reloads lambdas using `IsolatedModuleLoader`.

### `create:migration <name>`
- Creates a timestamped SQL migration in `migrations/`.

### `migrate:rollback`
- Rolls back last N migrations by applying the `@@rollback` section.

---

## Code Generation Pipeline

1. **Config Parsing**
  - `ConfigurableApi` wraps the user’s config and validates via Zod schema.
  - `ApiDefinition.from()` ensures routes, lambdas, database, etc. are well-formed.
  - `ImportParser` maps function imports to file paths for bundling.

2. **ApiBuilder**
  - Orchestrates generators.
  - Provides `generate()` (full infra) and `generateDevOnly()` (dev server only).

3. **Generators**
  - **CdkStackGenerator** → produces `lib/Stack.ts`.
  - **CdkAppGenerator** → produces `bin/app.ts`.
  - **CdkJsonGenerator** → `cdk.json`.
  - **PackageJsonGenerator** → `package.json`.
  - **TsconfigGenerator** → `tsconfig.json`.
  - **HelpersGenerator** → copies helpers dir.
  - **HandlerWrapperGenerator** → bundles and wraps route lambdas.
  - **AuthGenerator** → adds internal `/auth/*` routes.

---

## Builders (Fragment Producers)

Builders render **mustache fragments** that get assembled into the final CDK stack:

- **LambdaBuilder**
  - Builds Lambda declarations per route.
  - Injects env vars (global + per-route + DB).
  - Generates optional configs (memory, timeout, VPC).
  - Emits IAM policies if DB is enabled.

- **RouteBuilder**
  - Creates API Gateway `Resource` tree from route paths.
  - Adds `addMethod()` calls with throttling + auth.

- **DatabaseBuilder**
  - Injects VPC + RDS cluster connections + Secrets.
  - Adds ingress rules for Lambdas.

- **ApiConfigBuilder**
  - Generates API Key resources and Usage Plans.
  - Handles global/per-route throttling.

---

## Handler Wrapping & Dependency Bundling

- **HandlerWrapperGenerator**
  - For each route:
    - Bundles dependencies via `DependencyBundler`.
    - Creates versioned handler dir under `wrapped/`.
    - Writes an `index.ts` that wraps user handler with `wrapHandler`.
  - Updates root `package.json` with discovered dependencies.

- **DependencyAnalyzer**
  - Walks imports (`import`, `require`, dynamic import).
  - Distinguishes local vs npm deps.
  - Resolves versions from nearest `package.json`.

- **DependencyBundler**
  - Copies local deps into `wrapped/shared`.
  - For private packages, copies selective files.
  - Updates import paths in generated handlers.

---

## Dev Server Internals

- **Server**
  - Local HTTP server maps incoming requests to routes via `router.ts`.
  - Emulates API Gateway event structure with `emulator.ts`.
  - Invokes handlers using `IsolatedModuleLoader`.

- **Database**
  - Launches Postgres via Docker Compose.
  - Runs migrations automatically.

- **Hot Reload (HMR)**
  - `HmrIpcServer` listens for reload requests.
  - `HmrIpcClient` (used in generator) signals changes.
  - `IsolatedModuleLoader.clearCache()` clears Node require cache and reloads modules.

---

## Core Infrastructure (Shared)

- **CoreInfraStack**
  - Defines baseline VPC, Aurora cluster, and Secrets.
  - Deploys a `createDb` Lambda for provisioning databases.
  - Exports ARNs and IDs via CloudFormation outputs (consumed in generated stacks).

- **createDb.ts**
  - Custom Resource handler that ensures a DB exists within the shared cluster.

---

## Where to Change Things

- **Add new CLI command** → `bin.ts`, implement under `src/cli/`.
- **Change CDK output structure** → Generators (`src/generators/`).
- **Change templates** → Mustache files under `src/templates/`.
- **Change how routes/env/db are wired** → Builders (`src/generators/builders/`).
- **Change dependency bundling** → `DependencyAnalyzer` / `DependencyBundler`.
- **Dev server behavior** → `src/dev/`.
- **Core infra baseline** → `src/core-infra/`.

---

## Gotchas

- **ImportMap** must be set before `ApiDefinition.from()`; otherwise function → file path mapping fails.
- **HandlerWrapperGenerator** in dev mode version-tags each wrapper dir to support HMR.
- **Rollback migrations** only works if `@@rollback` section is present in SQL.
- **Core infra** must be deployed once (`core:init`) before any stack with a database.
