# AI Handoff — Internship Transcript System V2

## Snapshot

- Updated: 2026-09-18, Asia/Bangkok
- Phase: Release 1 implementation baseline; owner integration and release gates pending
- Current state: web/API/worker implemented, including secure SMTP settings, Academic Settings page (Schools & Programs CRUD), Verdana Health UI redesign, and fixed SVG icon bundling; last recorded local Production build passed, but the current rerun is blocked by the Nuxt/Vite `lightningcss` failure documented below
- Next safe task: obtain owner decisions and Production integration values, then finish release-blocked work
- Commit/push/deployment: not performed

## Latest engineering update

- Imported `C:\Users\asus\Downloads\สร้างไฟล์ Cer PDF + ส่งเมล. .xlsx` into the local development MongoDB using `apps/api/src/scripts/import-student-workbook.ts`: 94 students created, 2 rows skipped because `Tourism Business and Events` and `Hospitality Business Management` are not present in the current Program master. The source Course (`Cooperative Education`) and Academic Term (`2025/First`) are also absent, so `semester` and `company` were retained while optional `courseId` and `academicTermId` remained unset. The import is checksum/audit logged and safe to rerun.
- The workbook contains hard/soft-skill score/question columns but no situation-question columns. The importer detects and reports these columns; it intentionally does not persist them into evaluation records yet. `DATA-003` remains open for the full preview/commit API and UI workflow.

- Completed `FND-007`: `openapi-typescript@7.13.0` now generates `packages/api-client/src/generated/openapi.ts` from `docs/api/openapi.yaml`.
- Root scripts now expose `openapi:generate` and `openapi:check`; `pnpm verify` checks generated-client drift before other gates, so CI fails when the artifact is stale.
- `@internship/api-client` exports generated `components`, `operations`, and `paths` types and uses canonical `/health/live` and `/health/ready` paths for typed liveness/readiness calls.
- OpenAPI health schemas now match the NestJS health controller response shapes.
- Scoped FND-007 validation passed: OpenAPI lint/check, API-client lint/typecheck/tests/build, workspace typecheck/tests, and E2E tests.
- Full root verification remains blocked by pre-existing repository issues outside this task: broad Prettier drift, web ESLint errors in current dashboard work, and Nuxt/Vite `lightningcss` build failure (`[lightningcss minify] warnings is not iterable`).

## Implemented system

### Foundation and operations

- pnpm monorepo on Node.js 24 with strict TypeScript and one lockfile.
- Nuxt 4 web, NestJS API, BullMQ worker, shared config/types/validation/API-client/design-token packages.
- Owner-supplied Verdana Health design replaces the previous provisional red/gold direction across canonical documentation, three-layer runtime tokens, self-hosted typography, Nuxt UI defaults, public pages, and the admin shell.
- `.env.development`, `.env.production`, and `.env.example`; startup Zod validation and environment isolation.
- Development Compose: MongoDB replica set, Redis AOF/no-eviction, Mailpit, private MinIO bucket, optional full application profile.
- Production Dockerfiles run as the unprivileged Node user; Compose uses remote managed dependencies, read-only filesystems, health checks, loopback binding, and fail-fast secrets.
- CI performs frozen install, source/contract verification, and image builds. Additional security scanning remains an OPS/FND release gate.

### Security and identity

- Global default-deny guard, documented permission matrix, tenant/School/Program/Student/assignment scopes, and 404 concealment for sensitive owner lookups.
- OIDC Authorization Code flow with PKCE, state, nonce, issuer/client configuration, secure cookies, access/refresh JWTs, hashed session JTI, rotation, revocation, and expiry.
- Development login controller omitted in Production.
- External invitation token signed at send time; exchange creates least-privilege assignment-bound evaluator session.
- Request IDs, standardized safe errors, Helmet/CORS/rate limits, Pino redaction, and mutation audit interception.

### Product domains

- Academic Schools, Programs, Courses, and Terms.
- Students, Organizations, Evaluators, and Placements.
- Versioned competency sets, immutable publish, cycles, assignment snapshots, Draft/resume with optimistic revision, atomic idempotent submit, and final lock.
- Versioned email templates, placeholder allowlist, campaign preview/create, delivery queue/retry/status, and invitation creation.
- System Administrator-only SMTP settings page/API, Environment fallback, AES-256-GCM database override, and queued test delivery with credential-safe status.
- Versioned document templates, publish validation, generated-document jobs, PDF worker, checksums, private objects, and 300-second signed downloads.
- Scoped audit and completion reports.
- Nuxt staff dashboard, Student list, evaluation list, evaluator mobile form, correspondence monitoring, documents, audit screens, and Academic settings (Schools & Programs).

## Verification evidence

Passed locally with bundled Node.js `v24.14.0` and pnpm `11.0.7`:

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`: all workspace suites passed
- `pnpm test:e2e`: passed
- `pnpm openapi:lint`: valid, no warning
- `pnpm build`: API/worker TypeScript and Nuxt/Nitro Production build passed
- API smoke against local MongoDB/Redis: liveness, readiness, Development session, authenticated Student list, and scoped report returned success
- SMTP settings smoke: System Administrator read/save returned redacted data, non-admin read returned `403`, stale-version save returned `409`, and the responsive page saved a disabled localhost configuration without sending email
- Verdana Health UI validation: 201 runtime token definitions resolved, machine-readable token references resolved, Vue source contains no raw colors, Fontsource assets bundled locally, Production SSR returned `200` for Landing/Login, and Lucide rendered as SVG.
- Development seed completed and is safe to rerun

Final `pnpm verify` passed on 2026-08-26 after the owner-supplied Verdana Health Design System, runtime token, typography, Nuxt UI, public-page, and admin-shell changes.

Not validated on this workstation:

- Docker image/Compose execution because Docker is not installed;
- SMTP and S3 worker integration because Mailpit/MinIO were not listening outside Docker;
- email Worker execution because the workstation Redis is `3.0.504`, below BullMQ's required Redis 5 minimum;
- real MFU OIDC, real SMTP/S3, TLS/reverse proxy, deployment platform, and container registry;
- MongoDB transactional submit against the Compose replica set; the available local MongoDB may be standalone.

## Owner decisions and inputs blocking live Production

| Topic          | Required input                                                                         | Blocks                         |
| -------------- | -------------------------------------------------------------------------------------- | ------------------------------ |
| MFU identity   | issuer, client credentials, claims, allowed domains, role mapping, logout/key rotation | AUTH-003 and SSO UAT           |
| Evaluation     | scoring scale/formula, required rules, multi-evaluator aggregation                     | final score/report semantics   |
| Reopen         | authorized roles, reason/window, notification and history visibility                   | EVL-006                        |
| Visibility     | when Student/Coordinator may see individual/aggregate results                          | documents/dashboard policy     |
| Invitations    | lifetime, OTP/verification, reuse/revoke/reminder policy                               | final external-access approval |
| Documents      | official layout, Thai/English fonts, signer/publisher, visual tolerance                | PDF release approval           |
| Infrastructure | domains, remote MongoDB/Redis/S3/SMTP, registry, secret manager, monitoring            | deployment                     |
| Governance     | retention, RPO/RTO, backup, incident and support owners                                | operations approval            |
| Migration      | approved anonymized dataset, included collections, thresholds                          | MIG-001–003                    |

The API deliberately returns `REOPEN_POLICY_NOT_CONFIGURED`, keeps aggregate score `null`, and rejects invalid Production configuration rather than inventing these rules.

## Remaining implementation/release work

- `DATA-003`: bulk Student import preview/commit.
- `DOC-102`: full client-only Konva editor and legacy adapter.
- `REP-002`: asynchronous audited export jobs.
- `MIG-001–003`: approved profiling, idempotent migration, rehearsal, reconciliation, rollback.
- Finish generated OpenAPI client drift enforcement and broad role/scope integration matrix.
- Run SMTP test delivery against Mailpit, then validate the approved Production provider/sender and encryption-key rotation procedure.
- Add/execute secret, dependency, SAST and container scans; load, WCAG, recovery, backup/restore, and PDF visual regression gates.
- Complete stakeholder UAT and deployment/rollback/incident/handover approval.

## Security warning inherited from legacy

The read-only legacy source at `C:\Users\asus\Documents\GitHub\InternshipTranscript` contains deployment patterns/values that must not be copied. Rotate legacy MongoDB/application credentials, remove exposed values from approved Git history, review access logs/users, and use new least-privilege secrets.

Existing user changes in that legacy worktree were preserved:

- modified `frontend/.env.production` and `frontend/.gitignore`;
- untracked `frontend/.vercelignore` and `frontend/dist/`.

## Git rule

This V2 directory is not currently a Git repository. Do not initialize, commit, create a remote, or push unless explicitly requested. Any future push target must have GitHub owner exactly `Napus-BackendDev`; never use the legacy remote.
