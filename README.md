# Nomcci CVMaker

Nomcci CVMaker is a portable CV editor built around hexagonal architecture. Its business rules and use cases do not depend on a hosting provider, database engine, AI vendor, or UI framework.

## Architecture

```text
apps/web                  React and Vite input adapter
apps/api                  Hono and Node.js input adapter
packages/domain           Entities and business policies
packages/application      Use cases and output port contracts
packages/contracts        Runtime-validated HTTP contracts
packages/rendering        Deterministic CV-to-HTML renderer
packages/adapters-node    Local auth, AI, files, clock, IDs, and hashing
packages/adapters-database SQLite and MySQL repositories
database/sqlite           SQLite schema
database/mysql            MySQL schema
```

Dependencies point toward `domain` and `application`. Infrastructure adapters implement application ports and are selected only by the API composition root.

## Requirements

- Node.js 24 or newer
- npm 11 or newer
- Docker Desktop with Compose v2

## Install And Verify

```powershell
npm install
npm test
npm run typecheck:portable
npm run build
```

The default development composition uses deterministic local authentication and AI behavior. No external credentials are required.

## SQLite Development

```powershell
npm run dev:sqlite
```

Open `http://localhost:3000`. SQLite data is stored in a Docker volume and survives container restarts.

## MySQL Development

```powershell
npm run dev:mysql
```

Open `http://localhost:3000`. MySQL listens only on `127.0.0.1:3306` by default.

Stop either profile with:

```powershell
npm run dev:down
```

The example Compose environments are intentionally local-only. Production deployments must provide authenticated database connections and replace the development authentication and AI adapters.

## Configuration

The API understands these provider-neutral variables:

```text
HOST=127.0.0.1
PORT=3001
DATABASE_DIALECT=sqlite|mysql
DATABASE_URL=<database connection>
```

The frontend uses same-origin `/api` requests. During Vite development, `VITE_API_PROXY_TARGET` selects the API process behind the proxy.

## Deployment Adapters

Provider-specific deployment code belongs in a separate private downstream repository. That repository can consume tagged versions of this core or regularly merge this repository as its upstream while keeping deployment configuration and infrastructure identifiers private.
