# AGENTS.md — Internship Transcript System V2

## 1. Purpose

This file is the operating contract for AI coding agents and human contributors working in this repository. Read it before planning, editing, testing, committing, or generating code.

The project rebuilds the legacy `InternshipTranscript` system as a secure, testable V2. The legacy source at `../InternshipTranscript` is evidence only. Do not modify or copy its insecure patterns into V2.

## 2. Required reading order

Read only the documents needed for the task, in this order:

1. `AGENTS.md`
2. `README.md`
3. `AI_HANDOFF.md`
4. `TASKS.md`
5. `docs/INDEX.md`
6. Task-specific product, architecture, design, database, API, and acceptance documents

For API, authorization, or domain work, always read:

- `docs/api/openapi.yaml`
- `docs/architecture/PERMISSIONS.md`
- `docs/product/ACCEPTANCE_CRITERIA.md`
- `database.md`

## 3. Source-of-truth precedence

When documents disagree, use this order and record the conflict:

1. Approved acceptance criteria and explicit owner decisions
2. `docs/api/openapi.yaml` for HTTP contracts
3. `docs/architecture/PERMISSIONS.md` for authorization
4. `database.md` for persistence and integrity
5. `System.md` and `Techstack.md` for architecture
6. `Tor.md` and `Goal.md` for scope and priority
7. `docs/design/DESIGN_SYSTEM.md` for UI/UX implementation; `desgin.md` for route and screen intent
8. Legacy code for observed behavior only

Do not silently resolve a material conflict. Add a `TBD` or ADR and update `AI_HANDOFF.md`.

## 4. Fixed technical baseline

- Monorepo: `pnpm` workspace.
- Web: Nuxt 4, Vue 3, TypeScript strict, Nuxt UI, Pinia, Nuxt I18n.
- API: NestJS, TypeScript strict, REST under `/api/v2`, generated OpenAPI.
- Worker: Node.js/TypeScript worker for email, import/export, and PDF jobs.
- Database: MongoDB with Mongoose and explicit indexes.
- Queue: Redis and BullMQ or an approved equivalent.
- Files: S3-compatible object storage with short-lived signed URLs.
- Runtime: Node.js 24 LTS unless an approved ADR changes it.
- Testing: Vitest/Jest, Supertest, `@nuxt/test-utils`, Playwright, contract tests.

Do not introduce GraphQL, microservices, Kubernetes, AI scoring, blockchain, or a second primary database without an approved requirement and ADR.

## 5. Architecture boundaries

- Keep V2 a modular monolith split into `web`, `api`, and `worker` deployables.
- NestJS owns domain rules, authorization, persistence, audit, and public API contracts.
- Nuxt Nitro may handle SSR, secure session exchange, proxying, and thin BFF aggregation only.
- Do not duplicate domain rules in Nuxt server routes.
- Controllers validate transport and call use cases. Controllers must not call Mongoose models directly.
- Repositories hide Mongoose details from domain/application services.
- Background jobs must be idempotent and safe to retry.
- Published competency, email, and document template versions are immutable.
- Final evaluations are immutable. Reopening requires permission, reason, new version/state transition, and audit.
- All timestamps are stored as UTC and displayed in `Asia/Bangkok` where appropriate.

## 6. Security and authorization invariants

- Backend authorization is mandatory on every non-public endpoint. Frontend guards are UX only.
- Default deny. Every operation requires an explicit permission and resource scope.
- Student access is limited to the authenticated student's resources.
- External evaluator access is limited to active assignments represented by signed, expiring, revocable invitations.
- Return `404` instead of `403` where revealing resource existence would leak sensitive information.
- Production must not expose mock-login, mock-user, seed, debug, or unrestricted Swagger endpoints.
- Never log access tokens, cookies, invitation tokens, MongoDB URIs, SMTP credentials, storage credentials, or unnecessary PII.
- Use generic error responses: `code`, `message`, `details`, and `requestId`.
- Important mutations create audit events containing actor, action, target, scope, timestamp, request ID, and safe change metadata.
- Never copy credentials found in legacy `render.yaml` or legacy environment files. Treat them as compromised until rotated.

## 7. Environment rules

The server runtime must keep both files:

- `.env.development`: `NODE_ENV=development` and local MongoDB at `mongodb://localhost:27017/internship_transcript_v2_dev`.
- `.env.production`: `NODE_ENV=production` and remote values injected through a secret manager or clear placeholders until supplied.

Additional rules:

- Keep variable names consistent with code; current contract uses `MONGODB_URI`.
- Use `NUXT_PUBLIC_API_BASE_URL` only for values safe to expose to browsers.
- Never put server secrets under `NUXT_PUBLIC_*`.
- Never commit real secrets. Keep `.env.example` safe and complete.
- Startup must validate required environment variables and fail fast.
- Development must refuse a non-local MongoDB URI unless an explicit, reviewed safety override exists.
- Development email uses a sandbox/capture service and must not send to real recipients by default.

## 8. API and data rules

- `docs/api/openapi.yaml` is the canonical HTTP contract. Update it with every API behavior change.
- Generate frontend API types/client from OpenAPI; do not maintain duplicate handwritten response interfaces.
- List endpoints require pagination, deterministic sorting, filtering, and scope enforcement.
- Use camelCase JSON fields and MongoDB string identifiers at the transport boundary.
- Validate all request data. Do not use `any` in production features.
- Use archive/soft delete for referenced or auditable data.
- Enforce uniqueness and state transitions in database indexes/transactions where races are possible.
- Migration and seed scripts must be versioned, idempotent, support dry-run where practical, and produce reconciliation output.

## 9. UI rules

- Use Nuxt UI as the base component system and the three-layer tokens in `docs/design/`.
- Treat `docs/design/DESIGN_SYSTEM.md` as the canonical component, interaction, responsive, content, and accessibility contract.
- For page generation, begin with `design-system/internship-transcript-v2/MASTER.md`, then read the canonical Design System and any page override.
- Do not place raw colors in Vue components; raw values belong only in primitive token definitions.
- Use Nuxt file-based routing, layouts, route middleware, composables, and Pinia conventions.
- Every async screen has loading, empty, error, retry, and permission-denied states.
- Core flows work at 360 px width, keyboard-only, and target WCAG 2.2 AA.
- Thai and English content must not clip in UI or generated PDF.
- Konva/document editor code is client-only and must be isolated from SSR hydration.
- Destructive or high-impact actions require clear confirmation and result feedback.

## 10. Testing and verification

Every completed task must include tests proportional to risk. Required layers:

- Unit tests for rules, validation, scoring, mapping, and permission policies.
- Integration tests for repositories, indexes, transactions, queues, and API guards.
- OpenAPI contract tests for API responses and generated client compatibility.
- E2E tests for login, invitation, draft, submit, dashboard, document generation, and access denial.
- Regression fixtures for Thai/English content and legacy migration.

Before marking work complete, run the repository equivalents of:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
```

When the root `pnpm verify` script exists, use it as the primary local gate. Do not claim success for checks that were not run.

## 11. Task workflow

1. Select one ready item from `TASKS.md`.
2. Read its dependencies and linked contracts.
3. Confirm affected modules and non-goals.
4. Add or update tests before or with the smallest coherent implementation.
5. Update OpenAPI, database docs, permissions, acceptance criteria, or ADR when behavior changes.
6. Run scoped checks, then root verification.
7. Update task status and `AI_HANDOFF.md` with evidence, remaining work, and blockers.

Do not implement a blocked requirement by guessing. Use a testable placeholder/adapter and record the decision needed.

## 12. Definition of Done

A task is done only when:

- acceptance criteria pass;
- authorization includes positive, negative, and cross-scope tests;
- lint, typecheck, relevant tests, and build pass;
- API/schema/document changes are synchronized;
- logs and errors expose no secrets or unnecessary PII;
- `TASKS.md` and `AI_HANDOFF.md` reflect current state;
- no unrelated refactor or generated artifact is included.

## 13. Git and push policy

- Preserve unrelated user changes.
- Use focused Conventional Commits after explicit authorization.
- Before every push, verify host is `github.com` and repository owner is `Napus-BackendDev` unless the user supplies another exact approved owner.
- Do not push to the legacy `AstroByteBard/InternshipTranscript` remote.
- Do not create repositories, change remotes, commit, or push unless requested.
- Never include credentials in a remote URL, commit, log, or documentation.

## 14. Legacy evidence policy

The legacy folder is read-only reference:

```text
C:\Users\asus\Documents\GitHub\InternshipTranscript
```

Observed legacy features worth preserving at product level:

- academic School/Program/Course data;
- Student and Adviser management;
- general/specific competencies and suggestions;
- evaluation form and student results dashboard;
- student/adviser email templates and sending;
- Konva document template editor and PDF download.

Observed legacy patterns that must not be copied:

- mock authentication and client-trusted roles;
- broad unauthenticated CRUD endpoints;
- hard-coded localhost/public URLs;
- credentials in deployment configuration;
- mutable active templates without durable version snapshots;
- destructive delete of referenced data;
- unbounded list endpoints and inconsistent request/response contracts;
- email/PDF work inside synchronous request flows.

## 15. Decisions still requiring owner confirmation

- MFU SSO/OIDC issuer, claims, domains, and logout behavior.
- Exact score scale, required questions, aggregation, and result visibility date.
- Invitation lifetime, verification method, reminder schedule, and reopen policy.
- Whether multiple evaluators assess one placement and how results aggregate.
- Official transcript/certificate layouts and publishing authority.
- Production MongoDB URI, email provider, object storage, monitoring, RPO/RTO, and retention periods.

Keep these as `TBD` until an authorized owner decides them.

## 16. Git push policy

- **No Push Without Explicit User Command:** NEVER run `git push` or push code to GitHub automatically under any circumstances unless the user explicitly requests or commands a push in their prompt (e.g., "push", "อัพขึ้น github", "ดันขึ้น git").
- When explicitly commanded to push, verify the remote host is `github.com` and owner is `Napus-BackendDev` before pushing.
