# Internship Transcript System V2

Production-oriented internship evaluation, correspondence, reporting, and transcript generation for Mae Fah Luang University workflows.

## Status

The monorepo and primary Release 1 flows are implemented and build successfully. The code is a deployment-ready baseline, but it is **not approved for live Production traffic** until the owner supplies Production credentials, approves the remaining business rules and document assets, completes migration/UAT, and runs the operational release gates.

Implemented:

- Nuxt 4, Vue 3, Nuxt UI, Pinia, and Thai/English-ready responsive screens;
- owner-supplied Verdana Health visual system with Navy/Sage tokens, self-hosted fonts, accessible controls, and responsive public/admin shells;
- NestJS API under `/api/v2`, default-deny RBAC, resource scope, request IDs, safe errors, audit events, and redacted logging;
- OIDC Authorization Code flow with PKCE/state/nonce, rotating refresh sessions, Development-only login, and assignment-bound evaluator invitations;
- academic, student, organization, evaluator, placement, competency, cycle, assignment, Draft, submit, correspondence, document, audit, and report domains;
- BullMQ email/PDF workers with retry, idempotent identities, private S3 objects, checksums, and short-lived signed downloads;
- System Administrator SMTP settings page with Environment fallback, encrypted database override, and queued test delivery;
- MongoDB, Redis, Mailpit, and MinIO Development Compose stack;
- hardened web/API/worker images, Production Compose, OpenAPI validation, tests, and GitHub Actions builds.

Not yet release-approved:

- MFU OIDC credentials and claim/role mapping;
- scoring aggregation, result visibility, and reopen policy;
- official transcript layout, Thai/English font assets, and signer workflow;
- student bulk import, audited export jobs, full Konva editor migration, and legacy migration;
- Production infrastructure values, TLS/reverse proxy, monitoring, backup/restore drill, security/load/accessibility testing, and stakeholder UAT.

See [TASKS.md](TASKS.md) and [AI_HANDOFF.md](AI_HANDOFF.md) for exact status and blockers.

## Architecture

```text
Browser -> Nuxt 4 web -> NestJS API -> MongoDB
                              |
                              +-> Redis/BullMQ -> Worker -> SMTP
                                                    `-> private S3/PDF
```

Nuxt owns SSR and UI. NestJS owns authorization, domain rules, persistence, and audit. Worker jobs contain record IDs rather than secrets or full PII payloads.

## Requirements

- Node.js `24.14.0` (repository accepts Node 24.11+)
- pnpm `11.0.7`
- Docker Desktop for the complete local stack, or local MongoDB and Redis

## Development

```bash
pnpm install --frozen-lockfile
pnpm infra:up
pnpm seed:development
pnpm dev
```

Use `pnpm infra:full` to build and run dependencies plus all three applications in Compose.

| Service       | URL                                                      |
| ------------- | -------------------------------------------------------- |
| Web           | `http://localhost:8080`                                  |
| API           | `http://localhost:8081/api/v2`                           |
| Mailpit       | `http://localhost:8025`                                  |
| MinIO console | `http://localhost:9001`                                  |
| MongoDB       | `mongodb://localhost:27017/internship_transcript_v2_dev` |
| Redis         | `redis://localhost:6379`                                 |

Open `/login` and use the Development login. That route/controller is omitted when `NODE_ENV=production`.

## Environment

- `.env.development`: local MongoDB/Redis and capture-only email/object storage values.
- `.env.production`: non-secret placeholders; real values must be injected by the deployment secret manager.
- `.env.example`: safe variable inventory only; never use it as Production configuration.

`SMTP_SETTINGS_ENCRYPTION_KEY` must be the same 64-hex-character secret in API and Worker. Development uses the documented local-only value. Production must inject an independent stable key through Secret Manager. SMTP password entered through the admin page is encrypted before MongoDB persistence and is never returned by the API.

Configuration is validated with Zod before startup. Development rejects a remote MongoDB host. Production rejects placeholders, localhost dependencies, insecure public URLs/cookies, incomplete OIDC, capture mail, and missing secrets.

## Verification

```bash
pnpm verify
```

This gate runs formatting, lint, strict type checking, unit tests, E2E/contract tests, OpenAPI lint, package builds, and the Nuxt/Nitro Production build.

Useful individual commands:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm openapi:lint
pnpm build
```

## Production image and Compose handoff

1. Resolve every owner decision in `AI_HANDOFF.md` that affects the release.
2. Inject remote MongoDB, Redis, S3, SMTP, OIDC, JWT/pepper, domain, and registry values through the platform secret manager.
3. Put the API and web loopback ports behind an approved TLS reverse proxy/load balancer.
4. Build and scan immutable images, then deploy:

```bash
docker compose --env-file .env.production -f infrastructure/compose.production.yaml build
docker compose --env-file .env.production -f infrastructure/compose.production.yaml up -d
```

5. Run health, migration reconciliation, backup/restore, authorization, security, performance, accessibility, PDF visual regression, and UAT gates before enabling traffic.

Production dependencies are external managed services; the Production Compose file deliberately does not start a database, cache, mail server, or object store.

## Documentation

Start at [docs/INDEX.md](docs/INDEX.md).

- [AGENTS.md](AGENTS.md): mandatory implementation and safety rules
- [OpenAPI](docs/api/openapi.yaml): canonical HTTP contract
- [Permissions](docs/architecture/PERMISSIONS.md): RBAC and scope matrix
- [Acceptance criteria](docs/product/ACCEPTANCE_CRITERIA.md): behavior and release gates
- [Design system](docs/design/DESIGN_SYSTEM.md): UI/UX and accessibility contract
- [Production runbook](docs/operations/PRODUCTION_RUNBOOK.md): preflight, deploy, smoke, rollback, and recovery
- [System.md](System.md), [Techstack.md](Techstack.md), [database.md](database.md): architecture and data details

## Git policy

Commit or push only when explicitly requested. Before any push, verify the GitHub owner is exactly `Napus-BackendDev`. Never push V2 work to the legacy `AstroByteBard/InternshipTranscript` remote.
