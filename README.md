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
packages/ai               CV prompts, normalization, and AI service
packages/adapters-ai      Ollama, OpenAI, OpenRouter, and OpenAI-compatible models
packages/adapters-node    Local auth, files, clock, IDs, and hashing
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
npm run typecheck
npm run build
```

The default development composition uses deterministic local authentication and AI behavior. No external credentials are required.

Run the shared repository contract against a real MySQL instance with:

```powershell
$env:MYSQL_TEST_URL = "mysql://root@127.0.0.1:3306/cvmaker"
npm test --workspace @nomcci/cvmaker-adapters-database
```

Without `MYSQL_TEST_URL`, that contract is skipped and SQLite covers the same behavior.

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

## AI Providers

The CV-specific prompts and normalization live in `packages/ai`. Model transport is an output port, so API and domain code do not depend on a specific vendor.

Available providers:

- `fake`: deterministic and credential-free; default for development and tests.
- `ollama`: local models through Ollama's OpenAI-compatible API.
- `openai`: OpenAI API with `AI_API_KEY`; JSON mode on by default; `AI_BASE_URL` overrides the endpoint.
- `openrouter`: OpenRouter with `AI_API_KEY`; optional `AI_APP_URL` and `AI_APP_NAME` attribution headers; `AI_BASE_URL` overrides the endpoint.
- `openai-compatible`: any remote or self-hosted `/v1/chat/completions` endpoint.

Run SQLite or MySQL with the default local Ollama model:

```powershell
npm run dev:sqlite:ollama
npm run dev:mysql:ollama
```

The first run downloads the model into the `ollama_data` Docker volume. The base model is `qwen2.5:1.5b` (~1 GB), the smallest Ollama model that keeps reliable bilingual English/Spanish JSON output for the CV prompts. Change `AI_MODEL` in a private `.env` file to select another installed model.

For a remote compatible endpoint, create `.env` from `.env.example` and set:

```text
AI_PROVIDER=openai-compatible
AI_BASE_URL=https://your-model-host.example/v1
AI_MODEL=your-model
AI_API_KEY=your-secret
AI_JSON_MODE=true
```

`AI_API_KEY` is optional for local endpoints. Environment files containing real values are ignored by Git.

The example Compose environments are intentionally local-only. Production deployments must provide authenticated database connections and replace the development authentication and AI adapters.

## Configuration

The API understands these provider-neutral variables:

```text
HOST=127.0.0.1
PORT=3001
DATABASE_DIALECT=sqlite|mysql
DATABASE_URL=<database connection>
AI_PROVIDER=fake|ollama|openai|openrouter|openai-compatible
AI_BASE_URL=<endpoint ending in /v1; optional when the provider has a default>
AI_MODEL=<model identifier>
AI_API_KEY=<required for openai and openrouter, optional otherwise>
AI_APP_URL=<optional OpenRouter attribution site URL>
AI_APP_NAME=<optional OpenRouter attribution site title>
AI_TIMEOUT_MS=30000
AI_JSON_MODE=false
```

The frontend uses same-origin `/api` requests. During Vite development, `VITE_API_PROXY_TARGET` selects the API process behind the proxy.

## Web App

The React app (`apps/web`) is a four-step wizard (Template → Source → Preview → Improve) with English and Spanish from the start:

- Six template/style combinations over the canonical server renderer.
- Manual structured editing (experience, education, skills, languages, links) plus text/PDF import with local PDF.js extraction.
- Single-credit AI apply-all with import-workflow allowance support and one-level undo.
- Private per-user drafts (`cvmaker_unsaved_draft_v2`), saved sources/CVs, photo library (10 photos, FIFO), PDF export/archive, job tracker, and a `SUPER_ADMIN` metrics/limits panel.
- Development sign-in/out uses the same-origin `/api/dev/login` and `/api/dev/logout` endpoints; production must replace them with the private auth adapter.

## Deployment Adapters

Provider-specific deployment code belongs in a separate private downstream repository. That repository can consume tagged versions of this core or regularly merge this repository as its upstream while keeping deployment configuration and infrastructure identifiers private.
