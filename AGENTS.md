# Nomcci CVMaker Engineering Guide

## Architecture

- Keep `packages/domain` free of framework, network, database, filesystem, and provider imports.
- Define use cases and output ports in `packages/application`.
- Validate transport data with `packages/contracts` before calling application code.
- Implement infrastructure only behind adapters.
- Keep composition roots in `apps/api`; adapters must not select themselves.
- Keep React components focused on presentation and user interaction. API clients and browser persistence remain framework-neutral.

## Portability

- Do not add hosting-provider SDKs, deployment files, account identifiers, or service-specific URLs to this repository.
- Keep provider-specific production adapters in a separate private downstream repository.
- Support SQLite and MySQL through the same repository contract tests.
- Do not rely on external authentication, AI, email, or object storage for the default development environment.

## Quality

- Support English and Spanish for all public UI strings.
- Add characterization tests before moving existing behavior.
- Keep user ownership checks inside persistence operations.
- Make quota consumption atomic at the repository boundary.
- Do not initialize Git until the legacy provider-specific implementation has been fully removed and the tree has been scanned for private infrastructure metadata.

## Commands

- `npm test`
- `npm run typecheck:portable`
- `npm run build`
- `npm run dev:sqlite`
- `npm run dev:mysql`
- `npm run dev:down`
