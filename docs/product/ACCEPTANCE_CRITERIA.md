# Acceptance Criteria — Internship Transcript System V2

## 1. Purpose

These scenarios define observable release behavior. They are written to become automated API, integration, and Playwright tests. Requirement IDs trace to `Tor.md`; authorization traces to `docs/architecture/PERMISSIONS.md`; transport shapes trace to `docs/api/openapi.yaml`.

If an unresolved business decision affects expected behavior, the scenario is marked `TBD` and must not be treated as approved Production policy.

## 2. Shared test rules

- Use synthetic/anonymized fixtures only.
- Store timestamps as UTC; assert display conversion separately for `Asia/Bangkok`.
- Every API response includes or propagates a `requestId`.
- Every sensitive denial verifies response body contains no protected fields.
- Every significant mutation verifies an audit event.
- Concurrent/idempotency scenarios must run against a real disposable MongoDB/Redis-compatible environment, not only mocks.
- UI scenarios run at desktop and 360 px viewport when marked `Responsive`.

Required baseline actors:

- `adminTenant`: System Administrator in Tenant A
- `staffSchoolA`: Internship Staff scoped to School A
- `coordinatorProgramA`: Coordinator scoped to Program A
- `studentA`: Student A in Program A
- `studentB`: Student B outside Student A ownership
- `evaluatorA`: evaluator assigned to Student A
- `evaluatorB`: evaluator assigned to Student B
- `auditorA`: Auditor with approved School A scope

## 3. Authentication and authorization

### AC-AUTH-001 — Internal login redirects through approved provider

Trace: `FR-AUTH-001`

**Given** an unauthenticated internal user requests login with a safe return path  
**When** the user starts login  
**Then** the system creates protected state/nonce/PKCE data as required and returns or redirects to the configured MFU OIDC provider  
**And** the return path is restricted to approved application origins  
**And** no client-supplied role is accepted.

Status: `TBD` until MFU OIDC configuration is supplied.

### AC-AUTH-002 — Invalid OIDC callback is rejected

Trace: `FR-AUTH-001`

**Given** an OIDC callback has invalid state, nonce, issuer, audience, signature, or expired code  
**When** the callback is processed  
**Then** no authenticated session is created  
**And** the response does not reveal token validation internals  
**And** a safe security event is logged.

### AC-AUTH-003 — Backend denies missing authentication

Trace: `FR-AUTH-002`

**Given** no valid session or evaluator credential  
**When** any protected endpoint is called directly  
**Then** the API returns `401` with code `AUTHENTICATION_REQUIRED`  
**And** returns no protected resource data.

### AC-AUTH-004 — Student cannot access another Student

Trace: `FR-AUTH-002`, TOR `AT-01`

**Given** Student A is authenticated  
**When** Student A requests Student B profile, evaluation, placement, or generated document by direct ID  
**Then** the API returns `404 RESOURCE_NOT_FOUND`  
**And** does not reveal whether Student B or the resource exists  
**And** records a scoped security/audit event without protected Student B content.

### AC-AUTH-005 — Coordinator scope enforced in query and direct lookup

Trace: `FR-AUTH-002`

**Given** a Coordinator is assigned to Program A only  
**When** listing students or reports  
**Then** only Program A data is returned  
**When** requesting a Program B record by direct ID  
**Then** access is denied according to the concealment policy  
**And** changing query parameters cannot expand scope.

### AC-AUTH-006 — Evaluator is assignment-bound

Trace: `FR-AUTH-002`, `FR-AUTH-003`

**Given** Evaluator A has a valid session bound to Assignment A for Student A  
**When** Evaluator A requests Assignment B, Student B, or Evaluation B  
**Then** the API returns `404 RESOURCE_NOT_FOUND`  
**And** does not allow enumeration through timing/body differences beyond approved tolerance.

### AC-AUTH-007 — Expired or revoked invitation is unusable

Trace: `FR-AUTH-003`

**Given** an invitation is expired or revoked  
**When** its token is exchanged or an existing evaluator session attempts a protected mutation  
**Then** the system returns `401 INVITATION_INVALID`  
**And** no Draft or final evaluation is changed  
**And** the token value is absent from logs.
**And** expiration is no later than the assignment deadline or cycle close, whichever comes first.
**And** a reminder reuses the invitation without extending its deadline; revocation invalidates existing evaluator access.

### AC-AUTH-008 — Mock authentication is absent in Production

Trace: `FR-AUTH-004`

**Given** the API runs with `NODE_ENV=production`  
**When** a client calls any mock-login or mock-user endpoint  
**Then** the API returns `404`  
**And** no mock identities or fallback signing secret are loaded.

### AC-AUTH-009 — User revokes own session

Trace: `FR-AUTH-005`

**Given** a user has an active session  
**When** the user logs out or revokes that session  
**Then** subsequent requests with that session return `401`  
**And** other sessions remain active unless explicitly revoked  
**And** an audit event is created.

## 4. Academic, Student, Organization, and Placement

### AC-DATA-001 — Academic code uniqueness

Trace: `FR-MEM-005`

**Given** an active School/Program/Course/Term already uses a code within its documented uniqueness scope  
**When** authorized Staff creates another active record with the same normalized code  
**Then** the API returns `409 DUPLICATE_RESOURCE`  
**And** no duplicate record is inserted.

### AC-DATA-002 — Bilingual master data remains structurally valid

**Given** authorized Staff creates or updates academic data  
**When** localized names are submitted  
**Then** values are stored as `{ th, en }` according to schema  
**And** required locale rules are enforced  
**And** Thai and English text round-trip unchanged.

### AC-DATA-003 — Student uniqueness enforced under concurrency

Trace: `FR-MEM-003`

**Given** no Student has ID `S001` or the submitted normalized email  
**When** two requests concurrently create the same Student identity  
**Then** exactly one active Student is created  
**And** the other request returns `409 DUPLICATE_RESOURCE`  
**And** no partial placement/user mapping remains.

### AC-DATA-004 — Staff CRUD respects scope

Trace: `FR-MEM-001`, `FR-MEM-004`

**Given** Staff is scoped to School A  
**When** Staff creates, reads, updates, or archives a Student/Organization/Placement in School A  
**Then** the operation succeeds and is audited  
**When** the same Staff targets School B  
**Then** the API denies the operation and changes nothing.

### AC-DATA-005 — Referenced master data is archived, not destructively deleted

Trace: `FR-MEM-005`

**Given** a Program, Organization, Student, Placement, or Evaluator is referenced by historical workflow data  
**When** authorized Staff requests removal  
**Then** the record is archived or the request is rejected  
**And** historical references remain resolvable  
**And** new active workflows cannot select archived data.

### AC-DATA-006 — Bulk import preview reports row-level issues

Trace: `FR-MEM-002`

**Given** an import contains valid rows, duplicate Student IDs, invalid emails, and unknown Program codes  
**When** Staff requests import preview  
**Then** the response reports each row's normalized candidate or error  
**And** no persistent Student data changes  
**And** the preview receives a checksum/token for an unchanged commit.

### AC-DATA-007 — Bulk import commit is idempotent

Trace: `FR-MEM-002`

**Given** an approved preview token  
**When** the commit request is retried with the same idempotency key  
**Then** Students are created/updated once  
**And** the same reconciliation result is returned  
**And** a changed source file cannot reuse the old preview token.

### AC-DATA-008 — Pagination is mandatory and deterministic

**Given** a list contains more records than the default page size  
**When** a caller omits pagination  
**Then** the API applies documented defaults and returns page metadata  
**And** deterministic secondary sorting prevents missing/duplicate records across pages  
**And** page size cannot exceed the documented maximum.

## 5. Competency sets and evaluation cycles

### AC-EVL-001 — Draft competency version is editable

Trace: `FR-EVL-001`

**Given** an authorized Staff member owns or can manage a Draft competency version in scope  
**When** labels, questions, ordering, or scoring rules are updated with the current version number  
**Then** the Draft changes  
**And** optimistic version increments  
**And** an audit event captures safe change metadata.

### AC-EVL-002 — Published competency version is immutable

Trace: `FR-EVL-002`, TOR `AT-03`

**Given** competency version 1 is Published  
**When** authorized Staff attempts to edit it  
**Then** version 1 remains unchanged  
**And** the system rejects direct edit or creates Draft version 2 through the documented operation  
**And** existing assignments continue referencing version 1.

### AC-EVL-003 — Publish validates complete competency contract

Trace: `FR-EVL-001`, `FR-EVL-002`

**Given** a Draft competency version contains a missing required locale, duplicate criterion key, invalid score range, or no applicable Program  
**When** Staff publishes  
**Then** the API returns `422 VALIDATION_ERROR` with safe field details  
**And** status remains Draft.

### AC-EVL-004 — Only approved active version applies to new cycle

**Given** multiple historical Published/Retired versions exist  
**When** Staff creates or activates a cycle  
**Then** the cycle references one explicitly selected Published version  
**And** later template changes do not change the cycle snapshot.

### AC-EVL-005 — Cycle activation preview catches missing data

**Given** a cycle has Students without Placement, Evaluator assignment, or valid competency version  
**When** Staff requests activation preview  
**Then** the system returns counts and row-level actionable failures  
**And** activation makes no mutation  
**When** Staff activates with unresolved blocking failures  
**Then** the API returns `409` or `422` and remains Draft.

### AC-EVL-006 — Assignment uniqueness survives concurrent creation

Trace: `FR-EVL-004`

**Given** one Student has one workplace Evaluator per internship cycle
**When** two requests concurrently create that assignment  
**Then** exactly one active assignment exists  
**And** the uniqueness key is Placement plus Cycle, independent of Evaluator ID
**And** both requests resolve to a safe success/conflict result without duplicate evaluation instances.

### AC-EVL-007 — Assignment snapshots questions and scoring

Trace: `FR-EVL-005`

**Given** a cycle references Published competency version 1  
**When** an assignment/evaluation instance is created  
**Then** the instance stores immutable question, ordering, locale, required flag, and scoring-rule snapshots  
**And** publishing version 2 later does not alter the open instance.

## 6. Evaluation Draft, submit, and immutable result

### AC-EVL-008 — Evaluator saves and resumes Draft

Trace: `FR-EVL-003`

**Given** Evaluator A has an open Assignment A  
**When** partial valid answers are saved with the current version  
**Then** Draft state persists  
**And** reopening the form returns the same answers and next version  
**And** dashboard completion does not count the Draft as Submitted.

### AC-EVL-009 — Stale Draft cannot overwrite newer Draft

**Given** two browser tabs loaded Draft version 3  
**When** tab one saves and creates version 4  
**And** tab two attempts to save using version 3  
**Then** tab two receives `409 VERSION_CONFLICT`  
**And** version 4 remains unchanged.

### AC-EVL-010 — Submit requires complete valid answers

Trace: `FR-EVL-006`

**Given** an open evaluation has required rating and comment rules  
**When** the evaluator submits missing required answers, out-of-range scores, unknown criterion IDs, or invalid consent  
**Then** the API returns `422 VALIDATION_ERROR`  
**And** assignment remains editable/open  
**And** no final evaluation exists.

Required-question and valid score-range checks derive from the immutable assignment snapshot, not hard-coded UI values.

### AC-EVL-011 — Submit creates one immutable final result

Trace: `FR-EVL-004`, `FR-EVL-006`, TOR `AT-02`

**Given** Assignment A is open and Draft is complete  
**When** Evaluator A submits successfully  
**Then** one final evaluation is created atomically  
**And** assignment state becomes Submitted/Locked  
**And** final record stores snapshot/version, actor, submitted time, and consent evidence  
**And** an audit event exists  
**And** Draft mutation is no longer accepted.

### AC-EVL-012 — Concurrent/retried submit does not duplicate

Trace: `FR-EVL-004`, TOR `AT-02`

**Given** the same complete Assignment is submitted concurrently or retried after a timeout  
**When** requests share the operation/idempotency identity  
**Then** one final evaluation exists  
**And** all safe responses identify the existing final state  
**And** no duplicate dashboard count or notification occurs.

### AC-EVL-013 — Closed or expired assignment rejects mutation

**Given** an assignment is Closed, Expired, Revoked, or already Submitted  
**When** Draft or submit is attempted  
**Then** the API returns `409 INVALID_STATE_TRANSITION` or `401 INVITATION_INVALID` as applicable  
**And** no answer changes.

### AC-EVL-014 — Reopen is disabled in the MVP

Trace: MVP decision — reopen is not included.

**Given** an assignment has a Submitted final result
**When** any user attempts to reopen it or mutate its answers
**Then** authorization/state validation rejects the request
**And** no new editable version is created
**And** the original result remains immutable.

Future reopen work requires a new owner-approved policy and release scope.

### AC-EVL-016 — Category scores follow the MVP scoring policy

Trace: MVP decision — category means, no cross-category total.

**Given** a submitted assignment snapshot contains Hard Skill, Soft Skill, and Situation/comment questions
**When** the final result is calculated
**Then** Hard Skill and Soft Skill use separate arithmetic means of answered rating questions
**And** each category reports its answered count and scale; a category without answered ratings is `null`
**And** Situation/comment answers are excluded from scoring
**And** no cross-category aggregate, weighting, or pass/fail decision is invented
**And** UI, API, reports, and PDFs use the same versioned scoring result.

### AC-EVL-015 — Evaluator form is accessible and responsive

Trace: accessibility NFR, `FR-EVL-003`, `FR-EVL-006`

**Given** the evaluation form loads at 360 px or desktop width  
**When** used with keyboard and screen-reader semantics  
**Then** every question, rating, error, progress indicator, save, and submit control is reachable and labeled  
**And** validation is not communicated by color alone  
**And** Thai/English labels do not clip  
**And** expired/submitted/loading/error states are understandable.

Labels: `Responsive`, `Accessibility`, `E2E`.

## 7. Correspondence and invitations

### AC-MAIL-001 — Email templates are versioned and immutable after publish

Trace: `FR-MAIL-001`

**Given** email template version 1 is Published  
**When** Staff changes subject/body  
**Then** version 1 remains unchanged  
**And** a new Draft version is created  
**And** existing delivery records retain version 1 reference.

### AC-MAIL-002 — Unknown placeholder blocks publish/send

Trace: `FR-MAIL-005`

**Given** a Draft contains an unknown or context-invalid placeholder  
**When** Staff publishes or creates a campaign with it  
**Then** the operation returns `422 VALIDATION_ERROR`  
**And** no email job is queued.

### AC-MAIL-003 — Campaign preview makes no external write

Trace: `FR-MAIL-002`

**Given** Staff selects a cycle, audience, template, and filters  
**When** campaign preview is requested  
**Then** recipient counts, exclusions, invalid addresses, and sample rendering are returned  
**And** no invitation, delivery, or provider email is created.

### AC-MAIL-004 — Campaign creates one intended delivery per recipient

Trace: `FR-MAIL-002`

**Given** a valid preview and idempotency key  
**When** Staff confirms campaign creation  
**Then** one campaign and one intended delivery per eligible recipient are created  
**And** each job references the exact template version and invitation/assignment  
**And** duplicate confirmation returns the existing campaign.

### AC-MAIL-005 — Provider timeout does not create unintended duplicate

Trace: `FR-MAIL-003`, TOR `AT-04`

**Given** the provider accepted a message but the worker timed out before recording success  
**When** the job retries  
**Then** idempotency/provider reconciliation prevents an unintended second message  
**And** delivery state records the uncertainty/resolution  
**And** Staff can inspect the outcome without viewing credentials.

### AC-MAIL-006 — Staff can inspect and retry eligible failure

Trace: `FR-MAIL-004`

**Given** a delivery is Failed and retryable  
**When** authorized Staff retries it  
**Then** the same logical delivery identity is used  
**And** attempt count/backoff/state update correctly  
**And** unauthorized roles cannot retry  
**And** action is audited.

### AC-MAIL-007 — Development email cannot reach real users by default

**Given** the worker runs in Development  
**When** an email job executes  
**Then** it routes to configured sandbox/capture SMTP or allowlisted address  
**And** startup fails if configured to use Production sender/recipient behavior without explicit safety override.

### AC-MAIL-008 — SMTP settings are admin-only and secret-safe

Trace: `system.config.manage`, `AC-OPS-002`, `AC-OPS-003`

**Given** a System Administrator opens SMTP settings  
**When** settings are loaded or saved  
**Then** the API never returns plaintext, ciphertext, IV, or authentication tag  
**And** a supplied password is write-only and encrypted with AES-256-GCM before MongoDB persistence  
**And** omitting password preserves the existing encrypted password  
**And** optimistic version conflict returns `409`  
**And** every mutation is audited without credential fields.

**Given** any role without `system.config.manage`  
**When** that role reads, changes, or tests SMTP settings  
**Then** the API returns `403 PERMISSION_DENIED`.

**Given** Development mode  
**When** an administrator saves or tests a non-local SMTP host  
**Then** the API or worker rejects it before delivery.

**Given** valid effective settings  
**When** the administrator explicitly sends a test  
**Then** the API queues only the test record ID  
**And** the Worker updates queued/sending/sent/failed state without exposing recipient or credentials in the status response or logs.

## 8. Document templates and generated PDF

### AC-DOC-001 — Draft document template round-trips canonical JSON

Trace: `FR-DOC-001`

**Given** authorized Staff creates a template containing text, image, score table, suggestion block, and chart placeholders  
**When** Draft is saved and reopened  
**Then** canonical JSON and `schemaVersion` round-trip without semantic loss  
**And** assets/placeholders remain valid  
**And** optimistic concurrency protects newer edits.

### AC-DOC-002 — Publish validates and freezes document version

Trace: `FR-DOC-002`, TOR `AT-03`

**Given** a valid Draft document template  
**When** Staff publishes  
**Then** a Published immutable version is created  
**And** unknown placeholders, missing assets, unsupported nodes, or invalid page geometry block publish  
**And** later edits create a new Draft version.

### AC-DOC-003 — Konva editor does not break Nuxt SSR

**Given** a user opens a non-editor Nuxt route with SSR enabled  
**When** the application renders server-side  
**Then** no browser-only Konva global is accessed  
**When** the editor route loads in a browser  
**Then** the client-only editor initializes without hydration mismatch.

### AC-DOC-004 — PDF uses exact immutable snapshots

Trace: `FR-DOC-003`, TOR `AT-05`

**Given** an eligible Student, final visible evaluation, and Published template version 3  
**When** a generation job is created  
**Then** the job records Student/evaluation/template data snapshots and versions  
**And** later source changes do not alter the queued job output.

### AC-DOC-005 — Repeated generation is deterministic and auditable

Trace: `FR-DOC-003`, TOR `AT-05`

**Given** the same normalized snapshot, renderer version, assets, and fonts  
**When** PDF generation runs twice  
**Then** required content and metadata are equivalent under the approved deterministic policy  
**And** each generated record stores checksum, renderer/template/evaluation versions, status, and timestamps  
**And** retries do not create uncontrolled duplicate files.

Exact binary checksum equality versus normalized-content checksum: `TBD` pending renderer selection.

### AC-DOC-006 — Thai and English PDF render correctly

**Given** fixture data contains long Thai/English names, School/Program names, competency labels, and suggestions  
**When** an approved template renders  
**Then** no glyph is missing  
**And** text does not clip or overlap  
**And** line wrapping remains within approved page geometry  
**And** visual regression matches approved tolerance.

### AC-DOC-007 — Student downloads only own eligible document

Trace: `FR-DOC-004`, TOR `AT-01`

**Given** Student A owns an available generated document  
**When** Student A requests download  
**Then** the API returns a short-lived signed URL or streams the authorized file  
**When** Student A requests Student B document ID  
**Then** the API returns `404` and no signed URL  
**And** download access is audited according to policy.

### AC-DOC-008 — Processing and failure states remain safe

**Given** generation is Queued, Processing, or Failed  
**When** a permitted user requests status  
**Then** the API returns safe status and retry/support information  
**And** no internal file path, provider credential, stack trace, or other Student data is exposed.

## 9. Dashboard, reports, and export

### AC-REP-001 — Completion totals reconcile with assignment states

Trace: `FR-REP-001`

**Given** a fixture cycle contains known Draft, Open, Submitted, Expired, and Reopened assignments  
**When** the overview report is requested  
**Then** totals exactly match the documented state definitions  
**And** percentages define denominator and rounding  
**And** repeated queries over unchanged data return consistent totals.

### AC-REP-002 — Report filters cannot expand scope

Trace: `FR-REP-001`

**Given** Coordinator Program A requests a report with Program B filter or no filter  
**When** the API executes aggregation  
**Then** effective filters remain within Program A  
**And** no Program B count can be inferred from totals or error details.

### AC-REP-003 — Export snapshots filters and permission

Trace: `FR-REP-002`

**Given** an authorized user requests export  
**When** the job is created  
**Then** requester, effective scope, normalized filters, selected fields, snapshot time, and format are stored  
**And** later role expansion/reduction does not silently change the job dataset  
**And** request is audited.

### AC-REP-004 — Export download requires current authorization

Trace: `FR-REP-002`

**Given** an export is complete  
**When** its owner with current permission requests download  
**Then** a short-lived signed URL is issued  
**When** another user or a user whose permission was revoked requests it  
**Then** access is denied and no storage location is revealed.

## 10. Environment, security, and operations

### AC-OPS-001 — Development database isolation

Trace: TOR `AT-07`

**Given** `NODE_ENV=development`  
**When** API/worker starts with the standard configuration  
**Then** `MONGODB_URI` resolves to `mongodb://localhost:27017/internship_transcript_v2_dev`  
**And** a remote/Production MongoDB URI is rejected without an explicit reviewed safety override  
**And** logs do not print the URI credential.

### AC-OPS-002 — Production secrets fail fast and stay private

**Given** `NODE_ENV=production` and a required secret is absent/placeholder  
**When** the service starts  
**Then** startup fails before accepting traffic  
**And** error identifies the missing variable name but not other secret values  
**And** no Production secret is present in browser runtime config.

### AC-OPS-003 — Logs redact sensitive values

**Given** a request contains Authorization, Cookie, invitation token, SMTP/storage data, MongoDB URI, or sensitive PII  
**When** success, denial, error, or retry is logged  
**Then** configured fields are removed/redacted  
**And** request ID and safe diagnostic metadata remain.

### AC-OPS-004 — Queue job recovers after worker restart

**Given** an idempotent job is Processing when worker stops unexpectedly  
**When** worker restarts  
**Then** the job is recovered or safely retried  
**And** no duplicate business side effect occurs  
**And** final state/attempt evidence is visible to authorized Staff.

### AC-OPS-005 — Backup restore drill reconciles required data

**Given** an approved backup  
**When** restored into an isolated environment  
**Then** required collection counts, indexes, references, audit chain, and selected generated-document metadata reconcile  
**And** measured recovery meets approved RPO/RTO.

Status: RPO/RTO remain `TBD`.

### AC-OPS-006 — Legacy migration is idempotent and reconciled

Trace: TOR `AT-06`

**Given** an approved anonymized legacy dataset  
**When** migration runs twice with the same version/input  
**Then** target records are not duplicated  
**And** migrated/skipped/quarantined/failed counts reconcile  
**And** invalid references and legacy field-name corrections are reported  
**And** rollback procedure is testable.

### AC-OPS-007 — Health endpoints distinguish liveness and readiness

**Given** service process is running but MongoDB/Redis required dependency is unavailable  
**When** liveness is checked  
**Then** process status follows the documented liveness policy  
**When** readiness is checked  
**Then** it returns non-ready without exposing connection details  
**And** no business request is accepted through a failed readiness gate where platform routing supports it.

## 11. Non-functional release gates

### Performance

Under the approved baseline load/dataset:

- API reads: p95 no more than 500 ms.
- API mutations: p95 no more than 1,000 ms, excluding background completion.
- Dashboard initial data: p95 no more than 2 seconds.
- PDF available: p95 no more than 30 seconds.
- List endpoints remain paginated and bounded.

Baseline concurrency, dataset size, and test environment must be approved before these become contractual pass/fail measurements.

### Reliability

- Monthly availability target: at least 99.5%, excluding approved planned maintenance.
- Queue jobs recover after restart.
- Backup is automated and restore drill passes.
- No final evaluation, published template version, audit event, or generated-document record is silently lost.

### Security

- No unresolved Critical/High security finding before Production unless written risk acceptance exists.
- Secret scan finds no new credential.
- Production uses TLS and least-privilege database/storage/email credentials.
- Mock/debug endpoints are absent or protected according to Production policy.
- Authorization matrix positive, negative, and cross-scope suites pass.

### Accessibility and localization

- Core flows target WCAG 2.2 AA.
- Core UI works from 360 px width.
- Keyboard-only path covers login, evaluator Draft/submit, Student download, and Staff core management.
- Thai/English UI and PDF fixtures have no missing glyph or clipped critical content.

### Maintainability

- TypeScript strict passes.
- OpenAPI validation and generated-client drift checks pass.
- Lint, unit, integration, contract, E2E, and build gates pass.
- Migration/seed scripts are versioned and idempotent.
- Changed behavior updates contracts, tests, task status, and handoff.

## 12. Release acceptance summary

Release 1 is accepted only when:

1. every Must requirement in release scope maps to passing scenarios;
2. UAT is approved by authorized Staff, Coordinator, Student, and Evaluator representatives;
3. migration reconciliation passes for approved scope;
4. security, performance, accessibility, backup/restore, and environment isolation gates pass;
5. Production credentials are rotated, injected through secret management, and absent from Git;
6. deployment, rollback, incident, backup/restore, and handover documents are approved;
7. all remaining `TBD` items that affect Production behavior have an owner decision or explicit release exclusion.
