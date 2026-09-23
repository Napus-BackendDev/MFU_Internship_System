# Implementation Tasks — Internship Transcript System V2

## 1. How to use this backlog

Work on one task at a time. A task may start only when every dependency is `Done` and no listed decision is unresolved.

Status vocabulary:

- `Done`: acceptance and validation completed with evidence.
- `Ready`: dependencies complete; implementation may start.
- `Blocked`: requires another task, owner decision, credential, or external system.
- `Planned`: sequenced but dependencies are incomplete.
- `In Progress`: one agent/contributor currently owns it.
- `Out of MVP`: explicitly excluded from this release; requires a new approved scope to resume.

Priority vocabulary: `P0` release foundation, `P1` core release, `P2` important follow-up, `P3` optional.

Every task must follow `AGENTS.md`, link relevant requirement IDs, add tests, and update `AI_HANDOFF.md` before completion.

## 2. Current milestone

**Release 1 implementation baseline complete; Production integration and release approval remain.**

Next safe engineering tasks: finish the P0/P1 integration gaps below. `FND-007` is complete. MFU SSO configuration and Production infrastructure remain release blockers.

Evidence snapshot (2026-09-23): full `pnpm verify` passes; production and full-workspace `pnpm audit` previously reported zero vulnerabilities. Production readiness rejects MongoDB without replica-set/sharded transaction capability. Isolated Mongo replica-set submit, outbox rollback/idempotency, and email recovery tests pass. No application DB, SMTP, S3, or production environment was used in the latest continuation. Docker daemon is unavailable, so container builds and real Redis outage/recovery remain unverified; real MFU OIDC/UAT and production operations remain external blockers. `In Progress` means implementation exists but one or more acceptance/validation items still lack evidence.

## 3. Documentation baseline

### DOC-001 — AI-first documentation set

- Status: `Done`
- Priority: `P0`
- Requirements: project governance and maintainability
- Deliverables: `AGENTS.md`, `README.md`, `docs/INDEX.md`, `TASKS.md`, `AI_HANDOFF.md`, OpenAPI, permissions, acceptance criteria
- Evidence: files exist, links resolve, OpenAPI parses, secrets scan passes

### DOC-002 — Rename and reorganize legacy-named V2 documents

- Status: `Planned`
- Priority: `P2`
- Depends on: `FND-001`
- Scope: move V2 documents into `docs/product`, `docs/architecture`, and `docs/design`; rename `desgin.md` to `DESIGN.md`
- Acceptance:
  - every internal link updated atomically;
  - no duplicate canonical document remains;
  - `docs/INDEX.md` reflects final locations.
- Validation: link checker and `rg` find no stale `desgin.md` reference.

### DOC-003 — UI/UX Design System package

- Status: `Done`
- Priority: `P0`
- Requirements: accessibility NFRs, UI rules in `AGENTS.md`, product screen intent
- Deliverables: `docs/design/DESIGN_SYSTEM.md`, `tokens.json`, `tokens.css`, `app.config.example.ts`, and AI retrieval `MASTER.md`
- Evidence:
  - Primitive → Semantic → Component token direction is documented;
  - owner-supplied Verdana Health Navy/Sage palette replaces the previous provisional red/gold direction and contrast pairs are recorded;
  - Plus Jakarta Sans, DM Sans, Fira Code, and Noto Sans Thai are self-hosted through the runtime design-token package;
  - Nuxt UI component mapping, domain patterns, responsive behavior, localization, and WCAG 2.2 AA gates are defined;
  - JSON parses, CSS token references resolve, Markdown links resolve, and example config passes structural checks.

## 4. Phase 1 — Foundation

### FND-001 — Initialize pnpm monorepo

- Status: `Done`
- Priority: `P0`
- Depends on: `DOC-001`
- Scope:
  - create root `package.json`, `pnpm-workspace.yaml`, `.npmrc`, `.nvmrc`;
  - scaffold `apps/web`, `apps/api`, `apps/worker` without domain features;
  - create `packages/api-client`, `packages/shared-types`, `packages/validation`, `packages/config`;
  - pin Node.js 24 and pnpm through repository metadata.
- Non-goals: authentication, business schemas, UI screens, deployment.
- Acceptance:
  - `pnpm install` uses one lockfile;
  - all three apps run a minimal health/start command;
  - root scripts expose `dev`, `build`, `lint`, `typecheck`, `test`, `test:e2e`, `verify`;
  - TypeScript strict enabled in all production packages.
- Validation:
  - `pnpm install --frozen-lockfile` after lockfile creation;
  - `pnpm lint && pnpm typecheck && pnpm test && pnpm build`.

### FND-002 — Shared lint, format, TypeScript, and test configuration

- Status: `In Progress`
- Priority: `P0`
- Depends on: `FND-001`
- Acceptance:
  - shared configs consumed by web/API/worker;
  - no app-level conflicting config;
  - CI-friendly, non-interactive scripts;
  - sample failing lint/type test proves gate works.
- Validation: root `pnpm verify`.

### FND-003 — Typed environment configuration and safe examples

- Status: `Done`
- Priority: `P0`
- Depends on: `FND-001`
- Requirements: `AT-07`, environment rules in `AGENTS.md`
- Acceptance:
  - create safe `.env.example` with no credential values;
  - API and worker validate environment at startup;
  - `.env.development` resolves MongoDB to localhost;
  - `.env.production` accepts remote secret injection;
  - Development rejects remote MongoDB unless explicit reviewed override;
  - public Nuxt config contains no server secrets.
- Validation: startup tests for missing values, local Development, and Production placeholders.

### FND-004 — Local infrastructure

- Status: `In Progress`
- Priority: `P0`
- Depends on: `FND-003`
- Scope: Docker Compose for MongoDB, Redis, Mailpit/capture SMTP, optional local S3 emulator.
- Acceptance:
  - one command starts local dependencies;
  - health checks defined;
  - data volumes named and documented;
  - no real recipient can receive Development email by default.
- Validation: clean startup, health checks, shutdown/restart recovery.

### FND-005 — CI quality gates

- Status: `In Progress`
- Priority: `P0`
- Depends on: `FND-002`, `FND-007`
- Acceptance:
  - frozen install, lint, typecheck, unit/integration, OpenAPI validation, build;
  - secret, dependency, SAST, and container scanning;
  - generated artifacts checked for drift;
  - no deployment or external write from pull-request jobs.
- Validation: passing pipeline plus intentionally failing fixture/branch proof.

### FND-006 — Error contract, request IDs, logging, and audit foundation

- Status: `Done`
- Priority: `P0`
- Depends on: `FND-001`, `FND-003`
- Requirements: security/observability NFRs
- Acceptance:
  - standard error shape `code`, `message`, `details`, `requestId`;
  - request ID propagated through API and queued job;
  - logger redacts tokens, cookies, URIs, credentials, and configured PII;
  - audit interface records actor/action/target/scope and safe metadata.
- Validation: redaction tests and API error contract tests.

### FND-007 — OpenAPI validation and client generation

- Status: `Done`
- Priority: `P0`
- Depends on: `FND-001`
- Acceptance:
  - root command validates `docs/api/openapi.yaml`;
  - TypeScript API client generated into `packages/api-client`;
  - CI fails when generated code differs;
  - NestJS DTO/controller response contract test exists.
- Validation:
  - `pnpm openapi:lint` passes;
  - `pnpm openapi:check` passes against the tracked generated artifact;
  - `@internship/api-client` lint, typecheck, tests, and build pass;
  - API health controller tests pass; root `verify` invokes `openapi:check` in CI.

### FND-008 — Dependency remediation and transactional readiness gate

- Status: `Done`
- Priority: `P0`
- Depends on: `FND-005`, `FND-006`
- Acceptance:
  - production and full-workspace dependency audits report zero advisories;
  - Production readiness accepts only MongoDB replica sets or sharded clusters with sessions and transaction-capable wire versions;
  - Development connectivity behavior and existing health response contract remain unchanged.
- Validation: `pnpm audit --prod`, `pnpm audit`, API tests, and full `pnpm verify` pass; transaction topology policy has positive/negative unit cases. Isolated MongoDB replica-set integration verifies submit transaction behavior.
- Limitation: broader containerized API/Worker/SMTP/S3 integration remains unverified because the Docker daemon was unavailable.

## 5. Phase 1 — Identity and access

### AUTH-001 — User, role assignment, and scope schemas

- Status: `In Progress`
- Priority: `P0`
- Depends on: `FND-006`
- Requirements: `FR-AUTH-002`
- Acceptance:
  - implement `users`, role assignments, session metadata, archive fields, indexes;
  - roles match `PERMISSIONS.md` exactly;
  - scope supports School, Program, Student ownership, and assignment ownership.
- Validation: schema/index integration tests and duplicate assignment tests.

### AUTH-002 — Development authentication adapter

- Status: `In Progress`
- Priority: `P0`
- Depends on: `AUTH-001`
- Requirements: `FR-AUTH-004`
- Acceptance:
  - development-only test identity provider behind interface;
  - route absent in Production build/runtime;
  - no fallback secret or fixed production account;
  - session uses secure httpOnly cookie or approved token strategy.
- Validation: Production endpoint returns 404; Development login E2E passes.

### AUTH-003 — MFU SSO/OIDC integration

- Status: `Blocked`
- Priority: `P0`
- Depends on: `AUTH-001`, owner supplies OIDC configuration
- Requirements: `FR-AUTH-001`
- Blocking decisions: issuer, client ID, claims, allowed domains, role mapping, logout, key rotation
- Production staff/student access must remain blocked until real MFU SSO and controlled account linking pass staging/UAT. Unknown OIDC subjects are rejected; email-only auto-link is not allowed.
- Acceptance:
  - Authorization Code with PKCE or approved server flow;
  - issuer/audience/nonce/state validated;
  - account mapped without trusting client-provided role;
  - login/logout/session-expiry E2E passes.

### AUTH-004 — Authorization policy engine and guards

- Status: `In Progress`
- Priority: `P0`
- Depends on: `AUTH-001`, `FND-006`
- Requirements: `FR-AUTH-002`, `AC-AUTH-003` through `AC-AUTH-006`
- Acceptance:
  - default deny;
  - permission and resource scope enforced in API;
  - `404` concealment used for cross-owner sensitive records;
  - positive, negative, and cross-scope matrix tests cover every role.
- Validation: permission suite generated from `PERMISSIONS.md` cases.

### AUTH-005 — External invitation and evaluator session

- Status: `In Progress`
- Priority: `P0`
- Depends on: `AUTH-004`, `EVL-003`, owner confirms invitation policy
- Requirements: `FR-AUTH-003`
- Blocking decisions: lifetime, verification/OTP, allowed reuse before submit, revoke and reopen rules
- Acceptance:
  - token stored hashed, signed/unguessable, expiring, revocable, assignment-bound;
  - token not logged or included in analytics/referrer leakage;
  - exchange creates least-privilege evaluator session;
  - expired/revoked/cross-assignment tests pass.

## 6. Phase 1 — Academic, member, and placement data

### DATA-001 — Academic master data

- Status: `In Progress`
- Priority: `P0`
- Depends on: `AUTH-004`
- Requirements: `FR-MEM-005`
- Scope: schools, programs, courses, academic terms
- Acceptance:
  - bilingual names use `{ th, en }`;
  - codes unique under documented scope;
  - referenced records archive instead of destructive delete;
  - list pagination/filter/sort and scoped read enforced.
- Validation: CRUD, duplicate code, archive-reference, and scope integration tests.
- Latest UI integration: real academic Terms now load from the API and can be created, edited, opened, or closed with pagination and explicit loading/error/empty states. Replica-set CRUD and scope tests remain open.

### DATA-002 — Students, organizations, evaluators, and placements

- Status: `In Progress`
- Priority: `P0`
- Depends on: `DATA-001`
- Requirements: `FR-MEM-001`, `FR-MEM-003`, `FR-MEM-004`
- Acceptance:
  - student ID and normalized email uniqueness enforced;
  - organization separated from evaluator person;
  - placement links Student, Organization, Program/Term, dates, and status;
  - evaluator assignment supports future multiple evaluators without forcing aggregation policy;
  - archive preserves history.
- Validation: schema/index, scope, and reference integrity tests.

### DATA-003 — Student bulk import preview and commit

- Status: `Planned`
- Priority: `P1`
- Depends on: `DATA-002`
- Requirements: `FR-MEM-002`
- Acceptance:
  - upload parses supported format into a temporary preview;
  - row-level errors, duplicates, and unresolved references reported;
  - commit requires matching preview token/checksum;
  - retry is idempotent and audited.
- Validation: fixture-driven import and reconciliation tests.

## 7. Phase 2 — Competency and evaluation

### EVL-001 — Versioned competency sets

- Status: `In Progress`
- Priority: `P0`
- Depends on: `DATA-001`, `AUTH-004`
- Requirements: `FR-EVL-001`, `FR-EVL-002`, `AT-03`
- Acceptance:
  - Draft versions editable; Published versions immutable;
  - hard/general competencies and suggestion prompts share canonical version model;
  - publish validates labels, questions, score rules, and Program applicability;
  - editing Published creates next Draft version.
- Validation: concurrency, immutable version, one-active-policy, and publish tests.

### EVL-002 — Evaluation cycles

- Status: `In Progress`
- Priority: `P0`
- Depends on: `DATA-002`, `EVL-001`
- Acceptance:
  - cycle binds term, dates, Program scope, and Published competency version;
  - preview reports missing placement/evaluator/data;
  - activation snapshots configuration;
  - invalid date/state transitions rejected and audited.

### EVL-003 — Evaluation assignments

- Status: `In Progress`
- Priority: `P0`
- Depends on: `EVL-002`
- Requirements: `FR-EVL-004`, `FR-EVL-005`
- Acceptance:
  - unique assignment key enforced under approved policy;
  - question/scoring snapshot created from cycle version;
  - assignment ownership drives evaluator access;
  - duplicate concurrent creation cannot produce two active assignments.
- Validation: unique index and race integration test.

### EVL-004 — Draft and resume

- Status: `In Progress`
- Priority: `P0`
- Depends on: `EVL-003`, `AUTH-005`
- Requirements: `FR-EVL-003`
- Acceptance:
  - evaluator saves partial answers only for own open assignment;
  - optimistic version prevents silent overwrite;
  - snapshot, not latest template, drives form;
  - expired/closed assignment rejects mutation.
- Validation: E2E save/resume and stale-version conflict tests.

### EVL-005 — Submit, lock, and duplicate protection

- Status: `In Progress`
- Priority: `P0`
- Depends on: `EVL-004`
- Requirements: `FR-EVL-004`, `FR-EVL-006`, `AT-02`
- Acceptance:
  - required answers and score ranges validated server-side;
  - atomic submit creates one final evaluation and locks assignment;
  - retry returns existing final state without duplicate record;
  - submit records actor, time, version, consent, and safe request evidence.
  - Hard Skill and Soft Skill use separate arithmetic means; Situation/comment does not score; no total or pass/fail is inferred; scoring policy version is stored.
- Validation: isolated replica-set tests verify draft/final transaction, category score projection, idempotent replay/payload conflict, concurrent identical submit, cross-owner denial, orphan-reference rejection, and rollback after a later write fails. Missing-answer/invalid-score and broader actor/state cases remain in the regression matrix.

### EVL-006 — Reopen workflow

- Status: `Out of MVP`
- Priority: `P1`
- Depends on: `EVL-005`, owner confirms reopen authority/window
- Requirements: `FR-EVL-007`
- Acceptance:
  - only permitted Staff/System Admin may request reopen;
  - reason mandatory;
  - prior final version remains immutable;
  - evaluator receives new controlled edit window;
  - full audit trail and notification created.

### EVL-007 — Nuxt evaluator form

- Status: `In Progress`
- Priority: `P0`
- Depends on: `EVL-004`, `FND-007`
- Requirements: `FR-EVL-008`, accessibility NFR
- Acceptance:
  - responsive at 360 px, keyboard usable, Thai/English safe;
  - loading/error/expired/submitted/permission states implemented;
  - save and submit behavior matches acceptance criteria;
  - no client-only permission assumption.
- Validation: component, accessibility, and Playwright core-flow tests.

## 8. Phase 3 — Correspondence

### MAIL-001 — Versioned email templates

- Status: `In Progress`
- Priority: `P0`
- Depends on: `AUTH-004`
- Requirements: `FR-MAIL-001`, `FR-MAIL-005`
- Acceptance:
  - Draft/Published/Retired lifecycle;
  - Published version immutable;
  - subject/text/html stored and validated;
  - only allowlisted placeholders compile;
  - preview uses synthetic data, not arbitrary Production records.
- Implemented: API sanitizes template HTML on create/update/publish/read; Worker escapes substituted values and sanitizes immediately before sending; browser previews use sandboxed iframe plus restrictive CSP. Regression tests reject script/event-handler/javascript/CSS URL payloads while preserving allowed styles and invitation placeholders.
- Remaining: workflow-level API/database integration test, plus review that preview data follows the approved privacy policy.

### MAIL-002 — Invitation/reminder campaigns and queue

- Status: `In Progress`
- Priority: `P0`
- Depends on: `MAIL-001`, `AUTH-005`, `FND-004`
- Requirements: `FR-MAIL-002`, `FR-MAIL-003`, `AT-04`
- Acceptance:
  - campaign preview shows recipients and validation failures;
  - one idempotent job per intended delivery;
  - provider timeout/retry cannot send unintended duplicate;
  - reminder keeps the existing invitation/PIN/deadline; only definite `failed` deliveries are retryable automatically, while `uncertain` requires reconciliation;
  - rate limits, backoff, max attempts, and failed state recorded.
- Implemented: email Workers claim deliveries with an owner token and renewable lease. A stale pre-SMTP attempt is atomically marked retryable and re-enqueued; an attempt that may have reached SMTP (including legacy `sending` rows) becomes `uncertain` and is never auto-resubmitted. Persisted `queued` deliveries and known queue-insertion failures are reconciled from Mongo at Worker startup and every 60 seconds, covering API interruption after the delivery record is durable. Recovery pages through backlogs; campaign state is reconciled from delivery records after claims and recovery.
- Validation: Worker recovery tests cover pre-SMTP requeue, post-attempt uncertainty/no resend, legacy rows, API-before-enqueue interruption, duplicate queued-job suppression, and backlog pagination. Isolated Mongo replica-set tests verify stale delivery transitions, durable queued-intent recovery, atomic campaign/invitation/delivery creation for generic, targeted, and direct flows, rollback on an injected persistence failure, and concurrent idempotent replay. Full real Redis outage/recovery and controlled Production index migration remain open.

### MAIL-003 — Delivery monitoring and retry UI

- Status: `In Progress`
- Priority: `P1`
- Depends on: `MAIL-002`
- Requirements: `FR-MAIL-004`
- Acceptance:
  - Staff filters queued/sent/delivered/failed/suppressed records by scope;
  - retry permission and idempotency enforced;
  - recipient PII minimized in list/log output.

### MAIL-004 — Secure SMTP settings and test delivery

- Status: `In Progress`
- Priority: `P0`
- Depends on: `FND-004`, `AUTH-004`, `MAIL-002`
- Requirements: `AC-MAIL-007`, `AC-MAIL-008`, `AC-OPS-002`, `AC-OPS-003`
- Implemented:
  - System Administrator-only Sidebar page and `/system-settings/smtp*` API;
  - Environment fallback plus versioned database override;
  - write-only AES-256-GCM password storage with dedicated Secret Manager key;
  - BullMQ test delivery containing only `testId` and status polling;
  - Development localhost/Mailpit enforcement and log/API redaction.
- Remaining validation:
  - execute Mailpit end-to-end send on the complete Development infrastructure;
  - validate approved Production provider, sender domain, rate limits, and credential/key rotation procedure.

## 9. Phase 3 — Documents and reports

### DOC-101 — Versioned document template model

- Status: `In Progress`
- Priority: `P0`
- Depends on: `AUTH-004`, `FND-004`
- Requirements: `FR-DOC-001`, `FR-DOC-002`, `AT-03`
- Acceptance:
  - canonical Konva JSON has `schemaVersion`;
  - Draft editable, Published immutable, Retired unavailable for new jobs;
  - placeholder allowlist validated before publish;
  - thumbnail and assets stored safely outside MongoDB when appropriate.

### DOC-102 — Nuxt Konva editor migration

- Status: `Planned`
- Priority: `P1`
- Depends on: `DOC-101`
- Acceptance:
  - browser-only code isolated with client boundary;
  - create/edit/preview/publish flows use Nuxt UI;
  - legacy template adapter has fixtures and schema-version tests;
  - unsaved changes and destructive actions guarded.

### DOC-103 — Server-side PDF worker

- Status: `Blocked`
- Priority: `P0`
- Depends on: `DOC-101`, `EVL-005`, official font/layout approval
- Requirements: `FR-DOC-003`, `AT-05`
- Acceptance:
  - job snapshots student/evaluation/template inputs;
  - deterministic Thai/English font rendering;
  - generated record stores template/evaluation versions, file key, checksum, status;
  - retry is idempotent;
  - object is private and download URL expires.
- Validation: PDF metadata/content fixture and visual regression for approved templates.

### DOC-104 — Student document access

- Status: `In Progress`
- Priority: `P0`
- Depends on: `DOC-103`, `AUTH-004`
- Requirements: `FR-DOC-004`
- Acceptance:
  - Student sees only own eligible documents;
  - cross-student lookup concealed and audited;
  - signed URL short-lived and cannot expose storage credentials;
  - unavailable/processing/failed states shown.

### REP-001 — Scoped completion dashboard

- Status: `In Progress`
- Priority: `P1`
- Depends on: `EVL-005`
- Requirements: `FR-REP-001`
- Acceptance:
  - totals derive from canonical assignment states;
  - Staff/Coordinator filters honor School/Program scope;
  - query parameters and definitions documented;
  - fixture totals reconcile exactly.

### REP-002 — Audited export jobs

- Status: `Planned`
- Priority: `P1`
- Depends on: `REP-001`, `FND-004`
- Requirements: `FR-REP-002`
- Acceptance:
  - export captures filters, requester, scope, format, and snapshot time;
  - generated asynchronously with private expiring download;
  - audit records request and download;
  - sensitive columns require explicit permission.

## 10. Phase 4 — Migration and hardening

### MIG-001 — Legacy data profiling and approved scope

- Status: `Blocked`
- Priority: `P0`
- Depends on: owner provides anonymized copy and migration scope
- Acceptance:
  - collection counts, nulls, duplicates, invalid references, locale shapes, and status values profiled;
  - no raw Production PII committed or copied to Development;
  - owner approves quarantine and reconciliation thresholds.

### MIG-002 — Idempotent migration adapters

- Status: `Planned`
- Priority: `P0`
- Depends on: `MIG-001`, target schemas complete
- Acceptance:
  - dry-run supported;
  - legacy typo/shape mapping explicit;
  - old-to-new ID map durable;
  - rerun produces no duplicates;
  - output reports migrated, skipped, quarantined, failed.

### MIG-003 — Migration rehearsal and reconciliation

- Status: `Planned`
- Priority: `P0`
- Depends on: `MIG-002`
- Requirements: `AT-06`
- Acceptance:
  - approved counts/references/sample values reconcile;
  - rollback procedure tested;
  - signed acceptance report produced.

### OPS-001 — Security, performance, accessibility, and recovery gates

- Status: `Planned`
- Priority: `P0`
- Depends on: all P0 feature tasks
- Acceptance:
  - no unresolved Critical/High finding without written risk acceptance;
  - agreed p95 targets met under baseline dataset/load;
  - core flows meet WCAG 2.2 AA target;
  - backup/restore and worker restart recovery drills pass;
  - RPO/RTO and retention decisions documented.

### OPS-002 — Production deployment and handover

- Status: `Blocked`
- Priority: `P0`
- Depends on: `OPS-001`, UAT approval, verified `Napus-BackendDev` repository and production credentials
- Acceptance:
  - immutable images and rollback tested;
  - secrets injected through platform manager;
  - remote production MongoDB uses least privilege/TLS/network controls;
  - smoke tests, monitoring, alerting, runbooks, training, and owner sign-off complete.

## 11. Owner decision register

| Decision                                     | Blocks                                 | Current state                                                             |
| -------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------- |
| MFU OIDC configuration and claims            | `AUTH-003`                             | `TBD`                                                                     |
| Invitation lifetime/verification/reminders   | `AUTH-005`, `MAIL-002`                 | deadline-bound; reminder reuses invitation and never extends time         |
| Score scale, required questions, aggregation | `EVL-005`, reporting                   | category means decided; scale/required rules come from published snapshot |
| Reopen authority and time window             | `EVL-006`                              | explicitly out of MVP                                                     |
| Result visibility policy                     | student dashboard/document eligibility | final result visible after atomic submit                                  |
| Official PDF layouts, fonts, publisher       | `DOC-103`                              | Certificate/Transcript only; use approved layout/assets                   |
| Production MongoDB/email/storage/monitoring  | `OPS-002`                              | `TBD`                                                                     |
| Retention, RPO, RTO                          | `OPS-001`                              | `TBD`                                                                     |
| Migration collections and thresholds         | `MIG-001`                              | `TBD`                                                                     |

## 12. Completion report template

Use this shape when changing a task to `Done`:

```md
Result: [observable outcome]
Changed: [files/modules]
Acceptance: [scenario IDs passed]
Validation: [exact commands and results]
Security/scope: [authorization and secret checks]
Remaining: [none or explicit follow-up]
```
