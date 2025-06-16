# AWS StackKit

A framework for building serverless APIs with automatic CDK infrastructure generation, local development server, and PostgreSQL integration.

## Table of Contents

* [What You Can Import](#what-you-can-import)
* [CLI Commands](#cli-commands)
* [Quick Start](#quick-start)
* [API Configuration](#api-configuration)
* [Database Helpers](#database-helpers)
* [Handler Development](#handler-development)
* [Local Development](#local-development)
* [Deployment](#deployment)

## What You Can Import

The SDK exports only these modules for your application code:

```ts
// Database helpers(imports are not right, there is no npm package yet)
import { insert, selectOne, selectAll, exec } from 'aws-stackkit'

// API configuration and types
import { createApi, ApiConfig, RouteConfig, DatabaseConfig, ApiEvent, AuthenticatedApiEvent } from 'aws-stackkit'
```

Everything else (CDK generation, deployment, migrations) happens through the CLI.

## CLI Commands

All infrastructure and deployment operations use the CLI:

```bash
# Generate CDK infrastructure files
npx aws-stackkit scaffold

# Deploy infrastructure to AWS
npx aws-stackkit deploy

# Run database migrations
npx aws-stackkit migrate

# Start local development server
npx aws-stackkit dev

# Deploy core shared infrastructure (one-time organization-wide setup)
npx aws-stackkit core:init

# Rollback to last deployed configuration
npx aws-stackkit rollback
```

## Quick Start

### 1. Create API Configuration

Create `api.config.ts` in your project root:

```ts
import { createApi } from 'aws-stackkit'

const api = createApi({
  name: 'My API',
  description: 'A sample API',
  database: {
    name: 'my_api_db',
    migrationsPath: './migrations'
  },
  auth: async (event) => {
    return { email: 'test@example.com' }
  }
})

api.addRoute({
  path: '/hello',
  method: 'GET', 
  lambda: './src/handlers/hello.ts'
})

api.addRoute({
  path: '/users/{id}',
  method: 'GET',
  lambda: './src/handlers/getUser.ts',
  auth: true // Route requires auth
})

export default api
```

### 2. Create Handler Functions

```ts
// src/handlers/hello.ts
import { ApiEvent } from 'aws-stackkit'

export default async function handler(event: ApiEvent) {
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'Hello, World!' })
  }
}
```

```ts
// src/handlers/getUser.ts
import { selectOne, AuthenticatedApiEvent } from 'aws-stackkit'

export default async function handler(event: AuthenticatedApiEvent) {
  const { id } = event.pathParameters
  const user = await selectOne('SELECT * FROM users WHERE id = :id', { id })
  
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(user)
  }
}
```

### 3. Generate and Deploy

```bash
npx aws-stackkit scaffold
npx aws-stackkit deploy
```

## Local Development

Start the development server with:

```bash
npx aws-stackkit dev
```

The dev server:

* Starts on `http://localhost:3000`
* Launches PostgreSQL via Docker
* Runs migrations automatically
* Emulates API Gateway Lambda integration

## Handler Auth Flow

When `auth: true` is set on a route, your `auth` function from `createApi({ auth })` runs first. If it returns something, that value is injected as `event.user`. If it returns nothing (or throws), the request is denied.

```ts
export default async function handler(event: AuthenticatedApiEvent) {
  const user = event.user
  console.log('Authenticated user:', user.email)
  // ...
}
```

## Database Helpers

Built-in helpers let you write clean database queries with named parameters. They work in dev and production.

### selectOne

Return a single row:

```ts
const user = await selectOne('SELECT * FROM users WHERE id = :id', { id })
```

### selectAll

Return many rows:

```ts
const users = await selectAll('SELECT * FROM users WHERE active = true')
```

### insert

Insert a new record:

```ts
await insert('users', { name: 'Alice', email: 'a@b.com' })
```

### exec

Run any SQL:

```ts
await exec('UPDATE users SET last_login = NOW() WHERE id = :id', { id })
```

Use named parameters everywhere to keep things safe and readable:

```ts
await selectOne('SELECT * FROM users WHERE email = :email', { email: input })
```
## Migrations

Migrations are just `.sql` files in your `migrationsPath`. Name them with a number prefix so they run in order.

Example:

```sql
-- ./migrations/001_create_users.sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  name TEXT NOT NULL
);
```

```sql
-- ./migrations/002_add_last_login.sql
ALTER TABLE users ADD COLUMN last_login TIMESTAMP;
```

To apply migrations in production, TEMP THIS IS UNSAFE PROBABLY:
```bash
npx aws-stackkit migrate
```

In development, they run automatically when you start the dev server:
```bash
npx aws-stackkit dev
```

Migrations are tracked so they won’t run twice. Just keep adding new numbered files. Never rename or delete old ones.
