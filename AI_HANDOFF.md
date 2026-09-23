# AI Handoff — Internship Transcript System V2

## Snapshot

- Updated: 2026-09-23, Asia/Bangkok
- Phase: Production MVP logic hardening; integration and release gates pending
- Current state: latest full `pnpm verify` passed after atomic campaign outbox integration: API 65 tests (including isolated replica-set business/recovery tests), Worker 14, Web 14, shared-types 6, config 8, email-security 3, and E2E 1; formatting, generated OpenAPI check/lint, lint, typecheck, and Production builds also pass. Production and full-workspace dependency audits previously reported zero vulnerabilities. Production release remains blocked by real MFU SSO, external services, document approvals, migration/operations, and UAT gates. Docker CLI exists, but Docker daemon is unavailable on this workstation.
- Next safe task: implement Student import preview/commit with durable row outcomes and isolated database tests; then continue PDF snapshot/template and reporting scope work. Real Redis recovery, deployment, and external release gates remain separate.
- Commit/push/deployment: not performed

## Latest engineering update

### 2026-09-23 — Transactional campaign outbox

- Generic campaigns, targeted invitation/reminders, and direct student invitations now persist their campaign, invitation, delivery, and (for direct invites) newly created assignment in one MongoDB transaction.
- Delivery rows are the durable outbox. BullMQ insertion occurs only after commit and is best-effort; a queue failure leaves the delivery `queued` for the Worker’s startup/periodic reconciliation instead of returning a false failed state or leaving a partial campaign.
- Added idempotent recovery for concurrent generic campaign requests that collide on the unique key. Added isolated Mongo replica-set tests for all three creation paths, rollback when delivery persistence fails, queue outage recovery state, and concurrent replay.
- Validation: full `pnpm verify` passes (API 65, Worker 14, Web 14; workspace typecheck/lint/tests, E2E, OpenAPI checks, and Production builds). Nuxt build emits existing upstream package-export and plugin-timing warnings but succeeds.
- No application database, Redis service, SMTP, object storage, deployment, commit, or push was used. The replica-set tests use a random loopback port and temporary test storage only.

### 2026-09-23 — Email worker lease recovery

- Added delivery owner tokens, a two-minute processing lease, and a 30-second heartbeat. Worker startup and a 60-second recovery pass inspect expired work.
- If a worker stopped before the persisted SMTP-attempt boundary, recovery conditionally marks the delivery retryable and re-enqueues it. The compare-and-set requires that no SMTP-attempt marker appeared after the recovery scan, preventing a stale scan from racing a live worker into a duplicate send.
- If SMTP may have been contacted, recovery marks the delivery `uncertain` and suppresses automatic resend. Legacy `sending` rows without lease metadata also fail closed as `uncertain`. A late live worker can finalize only its own token-bound attempt.
- Added database-backed queue reconciliation: durable `queued` delivery rows and known API queue-insertion failures are re-enqueued if absent from BullMQ, with stable attempt IDs and pagination beyond 100 rows. This closes interruption after delivery persistence but before queue insertion; campaign/invitation/delivery writes are now transactionally grouped (see newest update).
- Campaign status is reconciled from delivery state when a delivery is claimed and when stale work is recovered. Stable BullMQ recovery IDs and existing-job checks allow a later pass to retry queue insertion without duplicate active jobs.
- Validation: full `pnpm verify` passes after these changes (including 60 API tests, 14 Worker tests, 14 Web tests and 1 E2E test). Replica-set integration verifies pre-SMTP recovery/requeue, SMTP-started and legacy uncertainty/no-resend, and recovery of persisted queued delivery intent. Worker unit tests additionally verify race guard, duplicate-job suppression, and pagination beyond 100 records. Real Redis recovery integration and controlled Production index rollout remain unvalidated.
- No Production/dev application DB, real SMTP, object storage, deployment, commit, or push was used.

### 2026-09-23 — Isolated submit integration and mixed student-ID fix

- Added a dev-only MongoDB replica-set integration suite. It verifies draft-to-final flow, category scoring/projection, idempotent replay and payload conflict, concurrent identical submit, cross-evaluator denial, transaction rollback after an injected write failure, and rejection of orphan student references.
- The replica-set test exposed a production bug: business student numbers were included in Mongo `_id` query branches, causing Mongoose `CastError` during submit/status projection. Fixed identity lookup and applied cast-safe student-reference filters through evaluation, campaign, documents, email worker, and PDF worker paths.
- Found and fixed a second connected-flow bug: the Worker campaign model omitted the expected delivery total, so reconciliation could mark a campaign completed when delivery records were missing. API and Worker now use one shared status policy; missing/unrecognized deliveries fail closed as `partial`, and duplicate queue jobs trigger reconciliation without resending email.
- Validation: API 57 tests (including 5 replica-set workflow tests), Worker 8 tests, shared-types 6 tests, Web 14 tests; full `pnpm verify` passes. `pnpm audit --prod` and `pnpm audit` both report zero vulnerabilities.
- Local integration used the installed MongoDB 8.2.5 binary, a random loopback port, and an isolated temporary replica-set data directory because this Windows ARM64 host cannot use a Windows ARM MongoDB server binary. The existing MongoDB Windows service and its collections were not used by the test suite. A read-only metadata check confirmed that port 27017 belonged to that pre-existing service; no collection records were read or changed.
- No application DB, outbound email, object storage, deployment, commit, or push was used.

### 2026-09-23 — Dependency remediation and transaction readiness

- Updated SheetJS to the official 0.20.3 tarball, Nuxt UI to 4.11.2, and Nodemailer to 10.0.10; removed the now-redundant `@types/nodemailer` because Nodemailer ships its own types.
- Added pnpm 11 dependency overrides in `pnpm-workspace.yaml` for patched Tiptap, esbuild, fast-uri, js-yaml, Multer, qs, and SVGO versions. Both `pnpm audit --prod` and full `pnpm audit` report 0 vulnerabilities.
- Production API readiness now checks MongoDB `hello` topology, logical sessions, and transaction-capable wire version; standalone MongoDB is not ready in Production. Development retains its connectivity-only check. Added replica-set, sharded-cluster, standalone, session, and wire-version policy tests.
- At that point, `pnpm verify` passed with API 50, Web 14, and Worker 5 tests plus package suites, E2E 1, OpenAPI lint, and production builds.
- Docker daemon was unavailable (`dockerDesktopLinuxEngine` pipe missing), so containerized API/Worker/SMTP/S3 integration and container builds remain unverified. The later isolated replica-set evidence is recorded in the newest update above.

Production remains blocked by real MFU OIDC configuration and UAT, isolated transactional workflow/recovery tests, approved production services/secrets, document assets/publisher authorization, data migration approval, backup/restore, monitoring, and operational sign-off.

### 2026-09-23 — Template XSS, academic-term flow, and release gates

- Added shared `@internship/email-security` allowlist sanitizer for API writes/reads and Worker delivery. It strips active tags, event attributes, unsafe URL schemes, remote images, and risky CSS while retaining approved email formatting and supported placeholders.
- Worker now HTML-escapes substituted student/evaluator data before sanitizing the final message. Email previews render in sandboxed iframes with restrictive CSP and no network connections.
- Added sanitizer, worker-injection, and preview-isolation tests. New/updated suites: email-security 3 tests; worker 5 tests; web 14 tests.
- Reconnected Academic Settings' real Term list/add/edit/open-close actions to the API with pagination and loading/error/empty states. Removed the unused local-export function that included access PINs and fabricated year/score fallbacks.
- Replaced all 14 repository formatting failures and all 9 web lint errors found in that verification pass. Current full lint and format checks pass.
- An earlier `pnpm verify` run reached valid OpenAPI lint then exited with Windows Node/libuv assertion `!(handle->flags & UV_HANDLE_CLOSING)`. The final run after dependency and readiness fixes passed; see newest update above.
- Safe metadata-only environment check: development Mongo URI points to localhost; production URI uses MongoDB scheme and a non-local host. Secret values were not printed; no database connection was attempted.
- This continuation did not connect to MongoDB/Redis, send email, write S3, deploy, commit, or push.

Still open: real MFU OIDC and controlled account linking; isolated replica-set business tests; transactional outbox/lease recovery and campaign reconciliation; import preview/commit; document editor persistence and approved snapshot-based Certificate/Transcript PDFs; audited complete-scope exports; migration profiling/rehearsal; backup/restore, monitoring, UAT, and operational approval. The document UI remains non-production for official template editing/issuance until its canonical editor schema is fully supported by the PDF worker.

### 2026-09-23 — Production MVP logic continuation

- Implemented actor-aware user management, denied email-only OIDC account linking, and kept unknown/unlinked identities inactive until controlled linking exists. Current guard blocks demotion/archive of every active System Administrator; allowing removal only when another active administrator remains is still open.
- Evaluation reads/writes combine requested assignment ID with authorized scope. Draft and final submission require a writable cycle/deadline; final submit is transactional and idempotent. New scoring stores separate Hard Skill/Soft Skill means, answered counts, scale, and `mfu-category-mean-v1`; no aggregate/pass-fail is inferred.
- Direct and targeted invitation paths reject missing master data, use published versions, bind to real placement/cycle/evaluator, and require explicit idempotency keys. Generic campaign preflight checks assignment/cycle/evaluator/invitation state; reminder does not overwrite invitation or rotate PIN. SMTP timeout without a definitive rejection is `uncertain`, and ordinary retry is limited to `failed`.
- Disabled reopen permission for all roles in MVP and removed `reopened` assignment state from evaluator invitation exchange/PIN access. Legacy status remains representable but cannot grant access.
- Guarded the optional evaluation fixture script: it requires explicit opt-in, a local `internship_transcript_v2_test` database, and environment-supplied values; removed embedded secret and sensitive PIN/identity logging. It was not run.
- Tightened user-directory scope: list queries now require every School/Program ID in a role assignment to fit one authorized actor scope, not merely overlap it. Added regression coverage for mixed in-scope/out-of-scope assignments.
- Replaced per-process authentication throttling with atomic Redis fixed-window counters, environment-prefixed HMAC keys, `Retry-After`, and fail-closed `503` when Redis is unavailable. Forwarded IP headers are ignored unless Express resolves the client IP through explicitly configured `TRUSTED_PROXY_CIDRS`; `.env.example` documents the setting.
- This continuation did not connect to MongoDB/Redis, send email, write object storage, deploy, commit, or push. Existing dirty files were preserved.

Historical validation snapshot from before the latest continuation: `pnpm format:check` and web lint had failures; see the newer update above for the corrected results. Unit tests use policy-level fakes where noted; no live Redis integration was run. No isolated MongoDB replica-set business integration suite was run.

Still open before Engineering-ready MVP: transaction/outbox/lease recovery for campaign and worker side effects; isolated replica-set integration/E2E suite; unique-index migration dry-run and duplicate-email/reference profiling; import preview/commit; document editor persistence plus snapshot-based Certificate/Transcript generation; report/export reconciliation and complete scope matrix. Production additionally requires real MFU SSO, verified secrets/infra, monitoring, backup/restore, UAT, and operational sign-off.

- Imported `C:\Users\asus\Downloads\สร้างไฟล์ Cer PDF + ส่งเมล. .xlsx` into the local development MongoDB using `apps/api/src/scripts/import-student-workbook.ts`: 94 students created, 2 rows skipped because `Tourism Business and Events` and `Hospitality Business Management` are not present in the current Program master. The source Course (`Cooperative Education`) and Academic Term (`2025/First`) are also absent, so `semester` and `company` were retained while optional `courseId` and `academicTermId` remained unset. The import is checksum/audit logged and safe to rerun.
- The workbook contains hard/soft-skill score/question columns but no situation-question columns. The importer detects and reports these columns; it intentionally does not persist them into evaluation records yet. `DATA-003` remains open for the full preview/commit API and UI workflow.

- Completed `FND-007`: `openapi-typescript@7.13.0` now generates `packages/api-client/src/generated/openapi.ts` from `docs/api/openapi.yaml`.
- Root scripts now expose `openapi:generate` and `openapi:check`; `pnpm verify` checks generated-client drift before other gates, so CI fails when the artifact is stale.
- `@internship/api-client` exports generated `components`, `operations`, and `paths` types and uses canonical `/health/live` and `/health/ready` paths for typed liveness/readiness calls.
- OpenAPI health schemas now match the NestJS health controller response shapes.
- Scoped FND-007 validation passed: OpenAPI lint/check, API-client lint/typecheck/tests/build, workspace typecheck/tests, and E2E tests.
- Final `pnpm verify` passed after dependency remediation and MongoDB transaction-readiness tests; see newest engineering update for exact counts.

## Implemented system

### Foundation and operations

- pnpm monorepo on Node.js 24 with strict TypeScript and one lockfile, including the shared email HTML security policy package.
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
- Nuxt staff dashboard, Student list, evaluation list, evaluator mobile form, correspondence monitoring, documents, audit screens, and Academic settings (Schools, Programs, Courses, and real Academic Terms).

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

## Decisions and inputs blocking live Production

| Topic          | Required input                                                                 | Blocks                          |
| -------------- | ------------------------------------------------------------------------------ | ------------------------------- |
| MFU identity   | issuer, client credentials, verified claims, role mapping, logout/key rotation | Production staff/student access |
| Documents      | approved Certificate/Transcript assets, fonts, signer/publisher authorization  | Official PDF issuance           |
| Infrastructure | production MongoDB/Redis/storage/SMTP endpoints, secret manager, monitoring    | Production deployment           |
| Governance     | retention, RPO/RTO, backup, incident and support owners                        | Operational approval            |
| Migration      | approved anonymized dataset, included collections, reconciliation thresholds   | MIG-001–003                     |

MVP has no reopen path for any role. Hard Skill and Soft Skill averages remain separate; Situation/comment answers are unscored, with no cross-category total or inferred pass/fail. Production staff/student access stays disabled until real MFU SSO passes staging and UAT.

## Remaining implementation/release work

- Transactional outbox, queue lease recovery, and campaign/delivery reconciliation.
- Isolated MongoDB replica-set business integration/E2E tests, including scope, concurrent submit, queue retry, and PDF snapshot flows.
- Unique-index migration dry-run and duplicate/reference profiling before production indexes.
- `DATA-003`: backend-owned bulk Student import preview/commit with durable row outcomes.
- Certificate/Transcript editor persistence and immutable, snapshot-based official PDF generation.
- `REP-002`: audited asynchronous export jobs with complete server-side scope and pagination.
- `MIG-001–003`: approved profiling, idempotent migration, rehearsal, reconciliation, rollback.
- Complete runtime/OpenAPI contract and role/scope integration matrix.
- Validate Mailpit flow, then approved Production provider/sender and key rotation procedure.
- Execute secret, dependency, SAST/container scans; load, accessibility, recovery, backup/restore, and PDF visual regression gates.
- Complete real MFU SSO, stakeholder UAT, and deployment/rollback/incident/handover approval.

## Security warning inherited from legacy

The read-only legacy source at `C:\Users\asus\Documents\GitHub\InternshipTranscript` contains deployment patterns/values that must not be copied. Rotate legacy MongoDB/application credentials, remove exposed values from approved Git history, review access logs/users, and use new least-privilege secrets.

Existing user changes in that legacy worktree were preserved:

- modified `frontend/.env.production` and `frontend/.gitignore`;
- untracked `frontend/.vercelignore` and `frontend/dist/`.

## Git rule

This V2 directory is a Git worktree with pre-existing modified and untracked files. Preserve them; no commit or push was made. Never push unless explicitly requested, and verify the remote owner is exactly `Napus-BackendDev` before any future push.
