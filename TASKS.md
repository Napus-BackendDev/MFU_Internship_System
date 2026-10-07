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

Local UI audit (2026-10-06) — Done: repaired shared dropdown validation/accessibility, dialog focus/responsiveness, mobile menu, shell headings, locale-aware permissions/navigation, settings error/retry/save guards, form-builder filtering, account confirmation and SMTP sender fallback. Architecture and public API preserved. Synthetic coverage: 17 routes at three widths, two locales and two themes (204 route visits), plus six roles over all 14 protected routes in both locales (168 permission cases). Final isolated `pnpm verify` exits 0, no skips: contracts 22/22, API 399/399, Worker 47/47, Web 82/82, foundation 1/1, Playwright 46/46; formatting, OpenAPI check/lint, workspace lint/typecheck and all production builds pass. Temporary non-persistent Redis on loopback 16386 stopped with `SHUTDOWN NOSAVE`; fresh connections refused. See the dated UI increment in `AI_HANDOFF.md`. Production blockers below remain unchanged; no commit, push or deploy.

Prior Production environment check (2026-09-28, before the MongoDB URI parser fix): `.env.development` passed `loadEnvironment` and resolved MongoDB to localhost. `.env.production` reported validation failures for MongoDB/Redis/public/OIDC/S3 URL fields and `SMTP_SETTINGS_ENCRYPTION_KEY`; values were not printed or changed. Do not re-read local Production env after the credential exposure incident. Rotate the exposed MongoDB credential, provision/verify all Production values through the approved secret manager, then validate only with redacted output. `pnpm audit --prod` reported no known vulnerabilities at that time; no deployment/provider connection was attempted.

Latest isolated full gate (2026-09-29, after Student Directory export correction): `pnpm verify` completed all stages with isolated, non-persistent Redis 8.0.5 on WSL loopback port 16385 and ephemeral MongoDB replica sets. No skips: contracts 22/22, API 394/394, Worker 47/47, Web 82/82, E2E foundation passed, Playwright 19/19; formatting, workspace lint/typecheck, generated OpenAPI check/lint, and API/Worker/Web production builds passed. `git diff --check` and `pnpm audit --prod` pass; no known production dependency vulnerabilities reported. Docker Engine remains unavailable. Nuxt plugin-timing, Node `DEP0155`, Playwright `NO_COLOR`, and Redocly update notices were non-fatal. Isolated Redis was stopped with `shutdown nosave`; port 16385 has no listener. Port 6379 was not targeted; prior read-only health check returned connection refused (no listening socket observed), so shared Redis availability needs separate owner investigation. Hosted CI and external Production gates remain open. No Production services/data, real email/storage, deployment, commit, or push.

Latest Student Directory export correctness regression (2026-09-29): when no assignment existed for the selected cycle, the XLSX mapper chose the first Placement even if that Placement belonged to an older term. Regression first failed with old company/term values; mapper now requires the Placement's `academicTermId` to match the Student's selected-cycle term. Focused mapper tests pass 4/4; API lint and full no-skip `pnpm verify` pass.

Latest REP-002 snapshot consistency increment (2026-09-29): Student Directory source rows now load in the same explicit MongoDB snapshot transaction as export snapshot rows, export metadata, and request audit. `MembersService.listStudents` binds every source/reference query and pagination read to the transaction session; reads are sequential while a session is active. Replica-set regression updates Placement and Organization after the snapshot and verifies the joined export view remains coherent, while an ordinary live read sees the update. Report-export integration verifies the directory query runs inside the transaction. Full `pnpm verify` exits 0 with isolated Redis 8.0.5 on WSL loopback 16383 and ephemeral MongoDB replica sets, no skips: contracts 21/21, API 390/390, Worker 47/47, Web 72/72, E2E foundation 1/1, Playwright 18/18; format/OpenAPI, lint/typecheck, OpenAPI lint, and Production builds pass. Redis stopped with `shutdown nosave`; exact temp directory removed. No Production data/provider, SMTP/S3 write, deployment, commit, or push. REP-002 remains In Progress for REP-001/FND-004 acceptance, private object-storage recovery/provider validation, and documented production-scale query/load targets.

Latest targeted hardening (2026-09-29): confirmed Student Organization/Evaluator visibility is already limited to own Placement Organizations and Evaluators assigned to own assessments at that exact Organization; query filters only narrow access. Isolated Mongo regression passes 1/1. Student-directory download now rejects malformed/active-scheme URLs, URLs with embedded credentials, and insecure HTTP when the app is HTTPS, while preserving presigned URL bytes. Web URL tests pass 5/5; Web suite 77/77, lint, typecheck, and Production build pass. No production services or data were used.

Latest Web security-header increment (2026-09-29): added cryptographic per-response CSP nonces to SSR and streamed inline scripts; blocks inline/eval scripts, objects, and framing. `connect-src` permits self and only the exact configured API origin; HTTP origins are accepted only in Development. Nonce-bearing HTML is `private, no-store`; the policy retains inline styles for current Vue/document-preview styling. CSP E2E verifies rendering, nonce on executable inline scripts, nonce rotation, no browser CSP errors, restricted connect source, and cache headers. Built Production SSR smoke allows the exact HTTPS API origin and rejects HTTP. Isolated no-skip `pnpm verify` exits 0: contracts 21/21, API 390/390, Worker 47/47, Web 82/82, E2E foundation 1/1, Playwright 19/19; format/OpenAPI, workspace lint/typecheck, OpenAPI lint, and API/Worker/Web Production builds pass. `pnpm audit --prod` reports no known vulnerabilities. Redis 8.0.5 was isolated on WSL loopback port 16383 and shut down with `SHUTDOWN NOSAVE`; shared port 6379 and Mongo port 27017 were not touched. No Production provider/data, deployment, commit, or push.

MongoDB URI parser follow-up (2026-09-29): reproduced and fixed generic URL validation rejecting multi-host MongoDB replica-set URIs and checking only the first seed for locality. Valid TLS multi-seed/IPv6 inputs pass; every Development seed must be local, Production rejects any loopback seed, and malformed-URI errors do not echo credentials. Config tests 44/44, lint/typecheck pass. Latest no-skip `pnpm verify` used isolated non-persistent Redis 8.0.5 on WSL loopback 16383 and ephemeral MongoDB replica sets: format/OpenAPI, workspace lint/typecheck, contracts 21/21, API 384/384, Worker 43/43, Web 70/70, E2E foundation, Playwright 18/18, OpenAPI lint, and Production builds passed. Redis shut down with `shutdown nosave`; its exact temporary directory was removed, raw RESP PING confirms no backend, and port 6379 was not targeted. The exposed credential still requires rotation; Production readiness is not asserted.

Latest REP-001 Evaluation directory fix (2026-09-29): search and Organization filters now run server-side before pagination and remain intersected with actor scope; UI loads Student/Evaluator/Organization details only for IDs on the visible assignment page, and member lookup APIs enforce bounded ID filters. Previously search/filter was limited to the already-paginated rows and relation catalogs could each load up to 500 records. Controller, Mongo replica-set, and Playwright regressions cover filter correctness, scope isolation, and bounded relation requests; full isolated verification above passes. No Production data/provider, email/storage, deployment, commit, or push.

Pagination contract fix (2026-09-29): the shared all-pages loader defaulted to 500 while Document list endpoints cap requests at 100, causing default dashboard Generated Document/Template lookups to be rejected. Default is now 100; regression was observed red before the fix. Updated cycle E2E's mock to echo requested page metadata instead of hardcoding 500; helper suite 7/7 and focused cycle E2E 1/1 pass. Full isolated gate above passes. No Production data/provider, email/storage, deployment, commit, or push.

REP-001 cycle-manager scale follow-up (2026-09-29): added server-side debounced code/name search and status filter to the paginated cycle list, plus filtered-empty messaging. Replaced all-Program fetch for the selected School with the shared 25-row paginated/searchable lookup; errors remain retryable and cycle write API remains authoritative. Playwright covers filter queries, school-scoped bounded lookup, and create/preview/activate/close; focused E2E 1/1 and full isolated gate above pass.

Student reference lookup follow-up (2026-09-29): both `/app` staff dashboard and `/app/students` now query Schools, Programs, Courses, Terms, Cycles, and Competency Sets through scoped, page-bounded (25 rows) selectors instead of downloading full catalogs. Page-scoped Student/Placement term summaries preserve labels. API search and requested-ID filters intersect authorized scope; generated OpenAPI/client updated. Regression tests cover relation projection, filter scope, lookup request bounds, and recoverable lookup errors. Full isolated verification above passes. No Production data/provider, real email/storage, deployment, commit, or push.

Student page relation-scope regression (2026-09-29): `/students` enrichment previously omitted Student-owned Placement/Organization/Evaluator details because it used staff-only relation scope. The API now adds only the authenticated Student's own reference scope and joins evaluator projection through that Student's visible Placement and its Organization. Regression test reproduced the empty relation before the fix and excludes foreign Placements/mismatched evaluators after it. Full `student-crud.mongo.integration.test.ts` passes 51/51; API lint/typecheck pass. Full `pnpm verify` not rerun after this increment. No Production writes/provider calls, real email/storage, deployment, commit, or push.

Latest focused evaluator-state regressions (2026-09-28): reproduced submitted-assignment PIN rejection omitting its message, causing the API to return the generic HTTP word `Unauthorized`; all invalid PIN causes now share one safe Thai `PIN_INVALID` message. The isolated MongoDB regression failed before this fix and now covers expired/revoked invitations and submitted assignments. Playwright asserts expired/revoked/submitted PIN denial stays on the generic verification screen without fetching an assignment. Focused Playwright passes 6/6; API business-flow passes 1/1; API production build, lint, and typecheck pass. Student `organizations.read` remains limited to own placements and assigned evaluators at the matching placement organization; isolated role-matrix regression passes 1/1. No Production services/data, email/storage, deployment, commit, or push.

Latest REP-001 UI-query fix (2026-09-29): cycle rows plus Term, School, and Competency Set selectors use server pagination (25 rows) and scoped prefix search; first render does not fetch full reference catalogs. Cycle labels request only School/Term/Program IDs referenced by visible rows. API intersects requested IDs/search with actor scope; OpenAPI/client match. Student directory now uses scoped page-bound Placement/Organization relations, removing unbounded `/placements` and `/organizations` collection loads while preserving company details. Isolated Mongo and E2E request-count/display regressions pass. Remaining: bound other Student reference catalogs and other large directories/exports; profile large datasets and agree/measure production p95/load targets. No Production data/provider, email/storage, deployment, commit, or push.

Prior local quality-gate continuation (2026-09-28): Nuxt Web now consumes the shared ESLint type-safety policy for application TypeScript while keeping Vue/Nuxt parser and template-specific rules. A config-contract regression verifies shared typed rules and Vue type-aware parser settings; the web lint findings were fixed at call sites, preserving async failures and showing retry/error states. One invocation of `pnpm verify` without isolated services passed but skipped 4 API/1 Worker Redis-gated tests; the latest isolated full gate above reruns those tests without skips. Hosted CI execution remains open. No Production services/data, real email/storage, deployment, commit, or push.

Latest production-gate verification (2026-09-28): added a real Redis integration regression for shared authentication rate limits across two independent `AuthRateLimitStore` instances; third attempt is throttled and returns a bounded retry delay. CI contract requires `TEST_REDIS_URL`, failing closed if absent. Full `pnpm verify` exits 0 with isolated, non-persistent Redis 8.0.5: format/OpenAPI check, lint/typecheck, contracts 20/20, API 368/57, Worker 43/15, Web 69/20, E2E foundation, Playwright 12/12, OpenAPI lint, and Production builds. Redis used only loopback port 16380; temporary directory removed; Redis 3 on 6379 untouched. This closes the local engineering-verification gap, not Production release gates: `.env.production` validation still fails; real MFU OIDC/UAT, approved secrets/images, migration rehearsal, PDF assets/visual UAT, Docker/provider recovery, backup/restore, monitoring/on-call, load/accessibility checks, and release-owner sign-off remain open. No Production data/provider, real email/storage, deployment, commit, or push.

Latest verified increment (2026-09-28): reproduced and fixed two report-export recovery defects. First, Mongo stayed `queued` while BullMQ retained same-ID job as `failed`, so recovery `.add()` created no waiting job. Second, recovery read only 100 rows; transient enqueue failure in first batch starved all later rows. `ReportExportProcessor.recoverQueuedExports()` now retains live jobs, removes terminal jobs before re-enqueueing the same stable ID, and drains stable `_id`-cursor batches despite individual enqueue failures. Isolated Mongo replica set + Redis 8.0.5 regressions failed before fixes; 205-row case simulates 100 enqueue failures and verifies all 205 attempts, with 105 jobs queued. Report-export and email integrations pass 3/3 repetitions. Full `pnpm verify` exits 0 with `TEST_REDIS_URL=redis://127.0.0.1:16380`: format/OpenAPI, lint/typecheck, contracts 20/20, API 365/56, Worker 42/15, Web 69/20, Playwright 12/12, OpenAPI lint, and Production builds. CI contract checks every Redis integration fails closed if `TEST_REDIS_URL` is missing. Queue consumer is a test adapter; real SMTP/S3 provider behavior remains unverified. Redis was isolated/non-persistent; Windows Redis 3 on 6379 untouched. Docker Engine unavailable. No Production data/services, real email/storage, deployment, commit, or push.

Latest authorization/contract increment (2026-09-28): reproduced that campaign detail serialized the full Mongo document, exposing assignment IDs, creator, template reference, and idempotency material beyond the documented Coordinator summary. Campaign create, replay, and detail responses now use an explicit allowlist; detail adds only aggregate delivery counts, and a mixed-scope campaign ID returns `404`. OpenAPI and generated client now declare the summary shape. Coordinator summary, cross-scope rejection, and correspondence outbox regressions pass; Student Organization/Evaluator directory remains limited to own Placements and own assigned evaluators. Full `pnpm verify` exits 0 with isolated, non-persistent Redis 8.0.5: contracts 20/20, API 367/56, Worker 43/15, Web 69/20, Playwright 12/12, format/OpenAPI, lint/typecheck, OpenAPI lint, and production builds. No Production data/provider, real email/storage, deployment, commit, or push. Engineering verification does not clear external Production gates.

Prior scope and Redis verification (2026-09-28): confirmed Student `organizations.read` remains placement-scoped: only Organizations attached to the Student's own Placements and Evaluators assigned to that Student's assessments for the matching Placement Organization are listed; cross-Student search/filter returns no rows. The isolated Mongo regression passes 1/1. Earlier Redis/BullMQ recovery integration used fake Worker models with real Redis; it has since been strengthened by the Mongo+Redis test above. CI provisions Redis 8.0.5 and a contract test requires `TEST_REDIS_URL`. No Production data/services, real email/storage, deployment, commit, or push.

Prior correspondence idempotency fix (2026-09-28): isolated Mongo tests deterministically reproduced the preflight race for generic and targeted invitations: both callers observed an unused key, first committed, and second returned `INVITATION_ALREADY_EXISTS` before transaction replay. Both paths now recheck actor-scoped idempotency before returning preflight conflicts; targeted replay preserves campaign, delivery, invitation IDs and recipient. Regressions failed before the fix and pass 3 consecutive targeted runs; full outbox suite passes 21/21. Full `pnpm verify` exits 0: API 362/54, Worker 41/14, Web 69/20, contracts 19/19, Playwright 12/12, format, OpenAPI, lint, typecheck, and Production builds; `pnpm audit --prod` reports no known vulnerabilities. Engineering-ready only; real MFU OIDC/config, Production services/secrets, migration rehearsal, approved PDF assets/visual UAT, backup/restore, monitoring/on-call, accessibility/load checks, and release-owner sign-off remain external gates. No Production data/services, real email/storage, deployment, commit, or push.

Latest verification recheck (2026-09-28): one `pnpm verify` attempt reported two failures in campaign idempotency/rollback integration cases. Neither reproduced: outbox suite passed five consecutive runs, complete API suite passed 360/360 twice, and subsequent `pnpm verify` exited 0. Final gate: format/OpenAPI check, workspace lint/typecheck, contracts 19/19, API 360/54, Worker 41/14, Web 69/20, E2E foundation, Playwright 12/12, OpenAPI lint, and Production builds. No campaign source change made without a reproducible failure. Still Engineering-ready only: real MFU OIDC, Production secrets/infrastructure, migration rehearsal, approved PDF assets and visual UAT, backup/restore, monitoring/on-call, accessibility/load checks, and release-owner sign-off remain external gates. No Production data/services, real email/storage, deployment, commit, or push.

Earlier verification baseline (2026-09-28): `pnpm verify` exited 0: format, generated OpenAPI check/lint, workspace lint/typecheck, contracts 19/19, API 355 tests/53 files, Worker 40/13, Web 69/20, all package suites, E2E foundation, Playwright 12/12, and Production builds. Isolated Mongo business flow (import → invitation → submit → PDF → report) plus Student own-account directory scope passes 8/8. One E2E retry-counter assertion raced the asynchronous request; changed it to Playwright `expect.poll`, passed 3/3 targeted repetitions, then the full gate passed. No runtime code changed in that increment. Engineering-ready only; real MFU OIDC, Production secrets/infrastructure, migration rehearsal, approved PDF assets and visual UAT, backup/restore, monitoring/on-call, accessibility/load checks, and release-owner sign-off remained external gates. No Production data/services, real email/storage, deployment, commit, or push.

Current AUTH-004/DOC-102 authorization closure (2026-09-28): reproduced that School/Program-scoped Staff inherited shared `documentTemplates.manage/publish` while templates/assets had no corresponding scope fields; permitted read roles could request Draft content, canonical JSON, and private font keys. `AccessGuard` and the service now allow shared asset/template management only for System Admin or tenant-scoped Staff. Other permitted readers receive active Published summaries with whitelisted display metadata only; Drafts, canonical JSON, arbitrary metadata, placeholders, and private asset keys are omitted, and Published versions under archived templates return `404`. Designer actions are hidden and guarded for non-managers. OpenAPI/generated types, permission matrix, acceptance criteria, and E2E mock now match the policy. Focused API suites pass 34/34; browser policy/publish tests pass 3/3. Full `pnpm verify` exits 0: format/OpenAPI check and lint, workspace lint/typecheck, contracts 19/19, API 357/53, Worker 40/13, Web 69/20, Playwright 12/12, OpenAPI lint, and API/Worker/Web production builds. Production integrations and release approval remain external gates; no live data/provider, email/storage, deployment, commit, or push.

Current AUTH-003/AUTH-004 concurrency recheck (2026-09-28): added replica-set regressions for two simultaneous account links claiming the same exact `(issuer, subject)` and for two concurrent idempotent retries. Only one account can win the identity; matching retries return the same result and write one audit. The OIDC link suite passes 8/8 on three consecutive runs; the Student own-Placement Organization/Evaluator scope case passes 1/1. These are regression-only changes; no Production identity provider or data was contacted.

Current DOC-102 publish-flow increment (2026-09-28): the API publish operation existed but the Designer had no route to call it. System Admin/Internship Staff can publish a saved active Draft after explicit confirmation; API remains authoritative for schema, placeholder, geometry, asset-rights, stored-object, and font checks. Unsaved drafts cannot publish; stale/forbidden/invalid responses stay visible; Published versions are immutable. PDF issuance remains disabled pending official assets/layout and visual UAT. Browser regressions cover System Admin and Staff success plus Coordinator denial (3/3). The newest full `pnpm verify` exits 0: format, OpenAPI check/lint, workspace lint/typecheck, contracts 19/19, API 355/53, Worker 40/13, Web 69/20, all packages, E2E foundation, Playwright 12/12, and API/Worker/Web production builds. No Production service/data, email/storage, deployment, commit, or push.

Current DOC-102 data-flow continuation (2026-09-28): the Documents page fetched only the first 100 Students and first page of Schools, Programs, and Organizations; failures were converted to empty lists. It now loads every page for Students, Schools, Programs, Placements, and Organizations through the shared consistency-checking paginator, preserves failures, and shows an explicit retry state. Added regressions for 165 records at page size 100 and for propagating a failed later page. Pagination suite passes 6/6; full `pnpm test` passes (contracts 19/19; API 341/52, Worker 39/13, Web 69/20, other package suites); Vue typecheck and Web lint pass. Browser visual verification remains subject to the Windows ARM64 LightningCSS startup blocker. No Production data, storage, deployment, commit, or push.

Current release-gate revalidation (2026-09-28): confirmed Student Organizations/Evaluators remain scoped to own Placement and matching assigned evaluator; isolated Mongo suite passes 51/51. Root `pnpm lint`, `pnpm format:check`, and standalone Web `vue-tsc --noEmit` pass. `pnpm verify` passes formatting, OpenAPI generation check, workspace lint, and package/API/Worker typechecks, then fails at Nuxt `typecheck` because Windows Application Control blocks loading the existing LightningCSS ARM64 native binding (`ERR_DLOPEN_FAILED`). Do not bypass policy. The verify chain did not reach its later test/E2E/OpenAPI-lint/build steps; the immediately preceding full `pnpm test` passed (contracts 19/19; API 341/52, Worker 39/13, Web 69/20). No Production service/data, email, deployment, commit, or push.

Current `/app/students` data-flow continuation (2026-09-28): reference catalogs now load all pages and preserve API failures with retry; Placements load all pages in both all-cycle and cycle-specific views. Added a Playwright regression for `503` followed by successful retry. Full `pnpm test` passes (contracts 19/19; API 341/52, Worker 39/13, Web 69/20); root lint/format, Web typecheck, E2E TypeScript/foundation, API/Worker builds, and OpenAPI lint pass. Browser execution is blocked at Nuxt startup by Windows Application Control blocking LightningCSS ARM64 (`ERR_DLOPEN_FAILED`); regression remains unverified in browser. No Production writes, email, deployment, commit, or push.

Current AUTH-003 account-link policy confirmation (2026-09-28): owner selected exact configured/discovered issuer + case-sensitive subject mapping by System Admin to an active pre-created account, with required reason, transaction-coupled audit, and actor/operation/target/payload idempotency. Implementation already enforces this contract; account-link, controller, and local-provider tests pass 14/14. Web and E2E TypeScript checks plus root lint pass. Browser E2E and live MFU issuer/claims, identity-index migration rehearsal, logout/session behavior, and staging/UAT remain unverified; Production access must stay disabled until these gates pass.

Current UI error-state continuation (2026-09-28): Evaluation assignment metadata lookups converted Student/Evaluator/Organization API failures into empty lists and silently retried on mount, so rows could render with missing identity/company details without a visible error. Lookups now preserve Nuxt errors; the page shows a warning and explicit retry, with redundant silent retries removed. Added a Playwright regression using one synthetic `503` followed by recovery. Root `pnpm test` passes (contracts 19/19; API 341/52, Worker 39/13, Web 67/20, other package suites); root lint, Vue typecheck, E2E typecheck/ESLint, and Prettier pass. Browser run is unverified: Nuxt server cannot import `@nuxt/fonts` because `lightningcss.win32-arm64-msvc.node` is unavailable under Windows Application Control. No policy bypass, Production access, deployment, commit, or push.

Current DATA-003 continuation (2026-09-28): reproduced import commit accepting the same Mongo ObjectId row twice when one 24-hex ID used uppercase and the other lowercase; response reported `created` twice for one Student. Commit decisions now canonicalize row IDs before duplicate detection and idempotency hashing, rejecting duplicates before creating a commit or Student. Isolated import integration and parser suites pass 19/19; full API suite passes 341/341 across 52 files, API typecheck and targeted ESLint pass. No application database, migration, deployment, commit, or push.

Current AUTH-005 continuation (2026-09-28): found that the browser API client skipped session refresh on `/evaluate`, so an access-token expiry could prevent saving a still-valid evaluator draft. The client now shares one refresh request, retries the original request once only after refresh succeeds, preserves the original error if refresh fails, and leaves evaluator answers in the current form without redirecting. `/auth/me` remains on the auth store's explicit refresh path to avoid duplicate attempts. Added three unit regressions and an E2E regression for PIN login → expired access token → refresh → draft save. `pnpm test` passes (API 340/52, Worker 39/13, Web 67/20, contracts 19/19); Web `vue-tsc`, E2E TypeScript, Web/E2E ESLint, and Prettier pass. Browser E2E could not start: Windows Application Control blocks the LightningCSS ARM64 native module. `AUTH-005` remains In Progress until that E2E runs and external invitation/provider checks pass. No Production data/service, email, deployment, commit, or push.

Current FND-008 continuation (2026-09-28): reproduced Production Worker readiness returning `true` for a connected standalone MongoDB while Redis 7 was healthy, although Worker transactions would fail. Moved the shared Mongo transaction-capability predicate into `@internship/config`; Production Worker now checks Mongo `hello` before creating queues/workers and checks it again on readiness. Development topology requirements remain unchanged. Regression covers unsupported standalone, supported replica set, and development behavior; Worker/API capability tests pass 9/9. Full `pnpm test` passes (API 340/52, Worker 39/13, Web 67/20, contracts 19/19); root lint, formatting, API/Worker typechecks and builds pass. Nuxt/browser runtime remains blocked by Windows Application Control. No Production service/data, email, deployment, commit, or push.

Current REP-001 continuation (2026-09-28): Mongo regression reproduced a scoped Coordinator/Staff dashboard counting ready PDFs for a Student's out-of-scope Placement because report aggregation matched documents by Student only. Scoped reports now match each PDF to placement IDs from assignments that passed actor scope; tenant-wide System Admin/Staff retain tenant-wide totals, including legacy documents without placement snapshots when no dimension filter is requested. Scoped reports omit unattributable legacy documents. Regression confirms scoped total 2 versus tenant-wide total 4, excluding the out-of-scope and legacy documents only for scoped readers. Report suite passes 10/10; full `pnpm test` passes (API 340/52, Worker 39/13, Web 67/20, contracts 19/19), root lint/format, API/Worker typechecks/builds pass. No Production data/service, deployment, commit, or push.

Quality-gate follow-up (2026-09-28): release publisher also runs Gitleaks history scan and CodeQL before image jobs. Root ESLint now disables typed-only rules for JavaScript/MJS and includes repository `.mjs` tests/scripts in `pnpm lint`; full workspace lint, format check, and release/infra contracts pass locally. Latest `pnpm verify` passed format, OpenAPI generation check, and full lint, then stopped at Web `nuxt typecheck` because Windows Application Control blocks Rolldown's ARM64 native binding; tests/build stages did not run.

Current FND-004/FND-005/OPS-002 increment (2026-09-28): added a manual, confirmation-gated, `main`-only GHCR publisher behind the `production-images` GitHub Environment. It runs `pnpm audit`/`pnpm verify`, publishes per-service run-tagged candidates with BuildKit provenance and SBOM, scans the exact pushed digest for HIGH/CRITICAL findings, then keylessly signs and verifies with Cosign. Production refs are restricted to the three exact GHCR repositories; the wrapper verifies signatures against the pinned workflow identity before `pull` or `up` and fails closed without invoking Docker on failure. Added isolated Node contracts for repository pinning, signer identity, operation order, fail-closed behavior, release gates, scan-before-sign, and immutable action SHAs. Local execution, GitHub Environment reviewer configuration, hosted CI/release execution, GHCR permissions, actual signatures/provenance, Docker pull/start, and recovery remain unverified; no image was published and no workflow dispatched.

Current AUTH-004/OPS-002 revalidation (2026-09-28): the owner confirmed Students may see only Organizations linked to their own Placements and Evaluators assigned to their own assessments for the exact Placement Organization. Evaluator lookup checks Student + Placement ownership and exact Placement Organization. Isolated Mongo tests cover Organization/Evaluator directory results for System Admin, scoped Staff, Coordinator, Auditor, and Student; the Student result is limited to own placements/assigned evaluators. Evaluators are denied directory and generated-document permissions at AccessGuard and denied document list/detail/download in the service. Direct document-ID tests assert positive reads for five roles and `404` across Staff, Coordinator, Auditor, and Student scopes. Focused scope/permission tests pass 57/57; full `pnpm test` passes API 340/52, Worker 36/12, Web 64/19, package suites, and contracts 19/19. API typecheck, targeted ESLint, Prettier and `pnpm audit --prod` pass. Latest `pnpm verify` passed formatting, OpenAPI generation check, and workspace lint/typechecks through API/Worker, then stopped at Nuxt typecheck because the Windows ARM64 LightningCSS native binding cannot load; separate `vue-tsc --noEmit` passes. No policy bypass attempted. Docker daemon unavailable; local Redis is `3.0.504`, below BullMQ minimum. Secret-safe `.env.production` inspection found required Redis/public URLs/OIDC/SMTP/S3 values placeholder or local; Mongo URL is present but unverified. Full AUTH-004 matrix, Production config/integration, and container recovery remain unproven. No Production data/service, deployment, commit, or push used.

Latest FND-002/FND-004/OPS-002 increment (2026-09-28): Production runtime Compose now accepts only required `API_IMAGE`, `WORKER_IMAGE`, and `WEB_IMAGE` digest references and contains no build fallback; optional tagged builds live in a separate manifest. The production wrapper validates digest refs before each allowlisted config/pull/up/ps action, always renders config quietly, and forces `up --no-build`; it rejects tag-only refs without echoing values. Contract tests pass 13/13 (11 infrastructure + 2 quality-gate contracts), `pnpm format:check`, full `pnpm lint`, `git diff --check`, and synthetic runtime/build Compose config checks pass. A protected-main, manually confirmed publisher workflow now runs quality/security gates, builds SBOM/provenance images, scans exact digests, signs/verifies with Cosign, and records immutable refs. It has not been triggered, so no production image digests or provenance are available; Docker Engine is unavailable locally. System Admin OIDC linking policy is confirmed and implemented: exact configured issuer + case-sensitive subject to pre-created account, with reason, audit, and idempotency; real MFU provider config/UAT remains open. No production values, data, deployment, commit, or push used.

Previous FND-004/AUTH-003 increment (2026-09-27): System Admin exact issuer + case-sensitive subject account linking to pre-created users is confirmed, with reason, audit, and idempotency; focused OIDC tests pass 12/12 and browser E2E passes 6/6. Local Compose now health-gates Mailpit and API→Worker/Web; MinIO initialization has a bounded 120-second wait. `docker compose config --quiet`, infra regressions 3/3, and full `pnpm verify` pass. Docker daemon is unavailable, so real container startup/probe/recovery remains unverified. MFU provider values/UAT, production infrastructure/secrets, migration rehearsal, approved PDF assets/UAT, backup/restore, operations, scale/accessibility and sign-off remain release blockers. No production data/provider, deployment, commit, or push.

Previous REP-001 increment (2026-09-27): `/students` now returns an actor-scoped page, optional Mongo-derived totals/facets, and page-bound allowlisted School/Program/Course/Assignment/Placement projections. Removed parent-page all-page School/Program/Course/Academic-Term loads and the duplicate initial Student request; edit references load on modal open. Cycle pages now include term labels from only the referenced academic-term records, preserving scope and historical cycle choices. Mongo and E2E regressions cover projections, no catalog fetch on startup, and deferred edit loads. Full `pnpm verify` passed: API 338/51, Worker 35/12, Web 61/18, packages, infrastructure, E2E foundation, Playwright 6, OpenAPI, lint, typecheck, tests and production builds. Evaluation Cycles still load all pages; no accepted production load/p95 evidence. No application DB/provider, deployment, commit, or push.

Previous verified increment (2026-09-27, REP-001): `/students` now returns an actor-scoped page plus optional Mongo-derived status totals/facets and page-bound assignment/placement projections. The directory UI requests only the current Student page, sends year/semester/school/cycle/status/search filters to the API, rejects stale responses, and shows an explicit load error instead of old rows. Search includes direct Student fields, Course names/codes, and selected-cycle Organization/Evaluator relationships without widening the authorized Student/Placement/Assignment scope. Excel export fetches every page for the captured filters only when explicitly requested. The UI no longer downloads all Organizations, Placements, Evaluators, or Assignments to enrich the directory; API projections use field allowlists and omit evaluator phone and legacy invitation credentials. Replica-set regressions cover totals/facets, joined search, relation ownership, and projection redaction; E2E verifies relation-list endpoints are not bulk-requested. Full `pnpm verify` exited 0: API 338/51, Worker 35/12, Web 61/18, config 39/3, shared-types 15/3, email-security 3/1, design tokens 1, validation 1, API-client 2, infra 1, E2E foundation 1, Playwright 6; format, OpenAPI check/lint, lint, typecheck, tests, E2E and production builds passed. Schools/Programs/Courses/Cycles/Terms remain all-page loads; no production load/p95 evidence. No application DB/provider, deployment, commit, or push.

Latest MAIL-001 hardening (2026-09-27): reproduced `GET /email-templates/system` creating two Mongo records on a read. GET now returns built-in defaults without writes; campaign/invitation flows transactionally ensure a durable published version, and system-template edits atomically create the template/version pair. OpenAPI/UI metadata now permits virtual defaults without fabricated IDs/version timestamps. Added dry-run-first duplicate/legacy-row preflight and exact-database-confirmed unique-index migration; AC-MAIL-009 added. Focused template/campaign/MVP-flow regressions pass 30/30. Full `pnpm verify` exited 0: API 333/50, Worker 35/12, Web 59/17, packages, infra, E2E foundation 1, Playwright 6, OpenAPI checks, lint, typecheck, tests, and production builds. Non-fatal Nuxt plugin timing, Node DEP0155 and Playwright color warnings remain. No application DB migration, email, deployment, commit, or push.

Latest verified increment (2026-09-27, API contract parity): added a test comparing every non-development runtime route, HTTP method, declared permission and public security behavior with OpenAPI. It reproduced missing `/health` and three system-email-template routes, two method mismatches (`GET /generated-documents/{id}/download-url` was documented as POST; competency-version listing GET was absent), and an overbroad permission declaration on evaluation GET. Updated OpenAPI, regenerated the client, and route contract tests pass 4/4. Full `pnpm verify` exited 0: API 327 tests/49 files, Worker 35/12, Web 59/17, packages, infra 1, E2E foundation 1, Playwright 6; format/OpenAPI check+lint, workspace lint/typecheck, tests, E2E and production builds passed. Non-fatal Nuxt plugin timing, Node DEP0155 and Playwright color-environment warnings remain. Environment review confirms Development uses localhost and Production Mongo configuration is only an explicit placeholder; no secret was printed or changed. No production data/provider, deployment, commit, or push. Real MFU SSO/UAT, migration rehearsal, approved PDF assets/visual UAT, backup/restore, monitoring/on-call, performance/accessibility, production secrets and release-owner approval remain open.

Latest verified increment (2026-09-27, AUTH-001): account identity storage used a global unique `oidcSubject` index even though OIDC resolution is keyed by exact `(issuer, subject)`. A Mongo integration regression reproduced the false `409` for the same subject under distinct issuers. Replaced the index with case-sensitive compound uniqueness; same-pair duplicates still fail, and unlinked pre-created subjects stay unique in the missing-issuer namespace. Added an explicit dry-run-by-default migration that profiles duplicate/malformed identities, creates the replacement index before dropping the old global index, and requires exact database confirmation to apply. Added AC-AUTH-010 and aligned OpenAPI, permissions, and database docs. Focus OIDC suites pass 22/22. Full `pnpm verify` exited 0: API 325 tests/49 files, Worker 35/12, Web 59/17, packages, infra 1, E2E foundation 1, Playwright 6; format, generated OpenAPI check/lint, lint, typecheck, tests, E2E, and Production builds passed. Migration was tested only on disposable MongoDB and was not applied to application data. Real MFU issuer, migration rehearsal, staging/UAT, and Production release gates remain; no live DB/provider, deployment, commit, or push.

Latest verified increment (2026-09-27, AUTH-004): `GET /academic/terms` previously returned the entire term catalog to every `academic.read` role because actor scope was not passed to the service. A Mongo replica-set controller regression reproduced a Coordinator receiving an out-of-scope term. The route now returns tenant catalog only to System Admin/tenant Staff; scoped Staff, Coordinator, Auditor, Student and Evaluator get terms linked to their authorized placement, own Student record, or exact assignment. The declared `academicYear` filter now works and is ANDed with scope; OpenAPI/generated client use integer year. Regression covers role boundaries, year filtering, foreign-scope exclusion and malformed/missing evaluator assignment fail-closed. Full `pnpm verify` exited 0: API 320/48 files, Worker 35/12, Web 59/17, packages, infra 1, E2E foundation 1, Playwright 6; format/OpenAPI/lint/typecheck/tests/E2E/OpenAPI lint/build passed. No production data/services, deployment, commit, or push.

Latest verified increment (2026-09-27, AUTH-004): API Guard now passes downstream services only roles that independently satisfy the route's complete permission policy, and filters `roleScopes` to the same set. Before this, a Student+Coordinator actor could call `/reports/exports` through Coordinator permission while `ReportsService.assignmentFilter` also added the Student's own assignment outside Coordinator scope. Isolated replica-set route-to-export regression reproduced `rowCount: 1` before the role projection; after the fix, it verifies `rowCount: 0`. Guard/export tests pass; full `pnpm verify` exited 0: API 319 tests/48 files, Worker 35/12, Web 59/17, package suites, infra 1, E2E foundation 1, Playwright 6, format/OpenAPI/lint/typecheck/tests/build. No live DB/provider, deployment, commit, or push.

Latest verified increment (2026-09-27, AUTH-004): `GET /evaluations/:id` previously exposed a Student's own assignment draft when the same account also had an Evaluator role for another assignment. An isolated replica-set regression reproduced the disclosure before the fix. Draft projection now requires the requested assignment ID to match the actor's exact evaluator assignment scope; test confirms Student-owned draft stays hidden and the evaluator's own draft remains visible. Evaluation integration suite passes 29/29. Full `pnpm verify` exited 0: API 317 tests/48 files, Worker 35/12, Web 59/17, package suites, infra 1, E2E foundation 1, Playwright 6, formatting, OpenAPI check/lint, lint, typecheck, all tests, and Production builds. No live DB/provider, deployment, commit, or push.

Latest verified increment (2026-09-27): implemented the approved controlled OIDC account-linking flow. Only System Admin can bind an exact, case-sensitive provider `sub` to a pre-created account; issuer comes from the configured/discovered provider and cannot be supplied by the client. A reason is required, identity + transactional audit commit atomically, and actor/operation/target/payload-scoped idempotency permits safe replay while rejecting changed payloads or rebinding. Login now resolves exact issuer+subject; email-only matching remains prohibited. User Manager exposes the action only to System Admin and shows linked state without exposing issuer/subject. A serializer regression caught `oidcLinked` being recomputed after issuer redaction; the safe schema-derived flag is now preserved and tested. Existing records without `oidcIssuer` must be mapped before SSO login; do not cut over users without a reviewed mapping/rehearsal. OIDC/controller/Mongo/route regressions pass 19/19; browser E2E proves Admin linking succeeds and Staff cannot see the action. Full `pnpm verify` exited 0: API 316 tests/48 files, Worker 35/12, Web 59/17, config 39/3, shared-types 15/3, email-security 3/1, design-tokens 1, validation 1, API-client 2, infra 1, E2E foundation 1, Playwright 6; format, generated OpenAPI check/lint, lint, typecheck, tests, E2E, and Production builds passed. This uses a local protocol mock and isolated replica set only; real MFU SSO, migration mapping/rehearsal, staging/UAT, and release gates remain. No live DB/provider, deployment, commit, or push.

Latest verified increment (2026-09-27): mutation audit was fire-and-forget, so API success/error responses could finish before the bounded persistence retries and sanitized failure alert. Regressions reproduced this on successful and failed handlers. `AuditInterceptor` now awaits `recordSafely` before emitting the handler result or rethrowing its original error; the existing three-attempt retry and sanitized `AUDIT_PERSISTENCE_FAILED` path remain. Persistent audit-store failure still does not reverse a non-transactional mutation; high-impact business audit writes remain transaction-coupled, and production alert delivery/ownership must be verified. Targeted audit tests pass 8/8. Full `pnpm verify` exited 0: API 308 tests/46 files, Worker 35/12, Web 59/17, config 39/3, shared-types 15/3, email-security 3/1, design-tokens 1, validation 1, API-client 2, infra 1, E2E foundation 1, Playwright 4; format/OpenAPI/lint/typecheck/tests/build passed. No live DB/provider, deployment, commit, or push.

Latest verified increment (2026-09-27): added OIDC callback coverage at two levels. Service unit tests verify S256 PKCE and transient state/nonce/verifier binding; a local protocol mock exercises the real `openid-client` discovery, signed ID-token/JWKS validation, issuer/audience/nonce checks, and PKCE exchange without allowing network access beyond the mock origin. Tampered state, issuer, audience, nonce, token-exchange failure, and unverified email are rejected before account mapping. Full `pnpm verify` exited 0: API 306 tests/46 files, Worker 35/12, Web 59/17, config 39/3, shared-types 15/3, email-security 3/1, design-tokens 1, validation 1, API-client 2, infra 1, E2E foundation 1, Playwright 4; formatting, generated OpenAPI check/lint, workspace lint/typecheck/tests, and production builds passed. This is mock-provider evidence only: actual MFU SSO, controlled account linking, logout/session lifecycle, staging/UAT, and all release gates remain open; no live DB/provider, deployment, commit, or push.

Latest verified increment (2026-09-27): concurrent direct invitations with the same actor-scoped idempotency key previously returned `INVITATION_REISSUE_REQUIRED` instead of replaying the original operation. The service now recovers only the matching actor/operation/key campaign, verifies the request hash, returns the same assignment/invitation/campaign/delivery IDs, and reuses the stable BullMQ delivery job ID; a different payload returns `409 IDEMPOTENCY_KEY_REUSED`. The direct-link builder also fails closed with `503 PUBLIC_WEB_URL_NOT_CONFIGURED` rather than creating a localhost invitation if the public URL is missing; the isolated transaction regression proves no assignment/outbox rows remain. Added an environment-isolated auth-module regression: Production omits `DevAuthController`, Development registers it (2/2). Direct invitation suite 19/19; full `pnpm verify` exited 0: API 297/44 files, Worker 34/11, Web 59/17, package suites, infra 1, E2E foundation 1, Playwright 4; format/OpenAPI/lint/typecheck/tests/production builds passed. No live DB/provider, deployment, commit, or push. AUTH-004 matrix and Production gates remain open.

Latest verified increment (2026-09-27): cycle discovery and filtered Student reads under-read across roles. Scoped Staff could not see applicable global cycles in the picker; Student/Evaluator `cycles.read` returned no own cycles; a Student+Staff own placement in a global cycle without an assignment returned `404` or was omitted. Regressions reproduced before the fix. Cycle listing now includes explicitly scoped cycles, cycles applicable to in-scope placements, Student-own placement/assignment cycles, and Evaluator exact-assignment cycles; Student placement-derived cycles exclude Drafts. Student directory cycle access checks a matching in-scope placement or authorized own/exact assignment. Filters remain intersected; foreign cycles/records remain hidden. `awaiting_response` and `awaiting_evaluator` projections verify own + authorized Staff rows only. Focus suites: Evaluations 28/28, Student CRUD 49/49. Full `pnpm verify` exited 0: API 292/43, Worker 34/11, Web 59/17, package suites, infra 1, E2E foundation 1, Playwright 4; format/OpenAPI/lint/typecheck/tests/build passed. AUTH-004 matrix and Production gates remain open; no live DB/provider, deployment, commit, or push.

Latest verified increment (2026-09-27): multi-role reads were using `actor.scope.studentId` instead of combining it with other scopes authorizing the same action, hiding in-scope Staff reports, Student records, placements, and evaluations. Reads now OR the Student's own references with active permission-scoped role scopes; request filters remain ANDed. Evaluator Student/Placement reads are limited to the current valid assignment; malformed assignment IDs fail closed. Regressions reproduced under-counts (1 instead of 2), then verified authorized results and foreign-record exclusion. Focus suites: Reports 9/9, Student CRUD 49/49, Evaluations 26/26. Full `pnpm verify` exited 0: API 290/43 files, Worker 34/11, Web 59/17, all package suites, infra 1, E2E foundation 1, Playwright 4; format/OpenAPI/lint/typecheck/tests/build passed. `pnpm audit --prod` found no known vulnerabilities. Nuxt timing and Node `DEP0155` notices were non-fatal. AUTH-004 matrix and Production gates remain open; no live DB/provider or deployment.

Latest verified increment (2026-09-27): audit events for shared document-asset uploads and signed-URL issuance were missing target scopes, so other authorized auditors could not see these changes. Shared assets now use tenant scope; generated-document download events carry the stored document scope, loaded internally without exposing it in JSON. Out-of-scope denial events remain untagged to avoid revealing resource existence. Replica-set regressions reproduced empty scopes, then verified scoped/tenant audit visibility and JSON redaction. Full `pnpm verify` exited 0: API 287/43 files, Worker 34/11, Web 59/17, packages, infra 1, E2E foundation 1, Playwright 4; format/OpenAPI/lint/typecheck/tests/build passed. No live DB/provider or deployment. Production remains blocked: `.env.production` fails validation (`MONGODB_URI`, `REDIS_URL`, `PUBLIC_WEB_URL`, `NUXT_PUBLIC_API_BASE_URL`, `OIDC_ISSUER_URL`, `OIDC_REDIRECT_URI`, `SMTP_SETTINGS_ENCRYPTION_KEY`, `S3_ENDPOINT`); Docker daemon unavailable; local Redis is 3.0.504, below BullMQ support; real MFU OIDC/SSO and release evidence remain unavailable.

Latest verified increment (2026-09-27): competency Draft create/update/publish previously enforced route permissions but did not pass actor/scope into every service write. An isolated replica-set regression reproduced scoped Staff editing another School's Draft. These writes now require the appropriate active permission and restrict edits to sections in the Staff role scopes granting the action. Unchanged out-of-scope sections are preserved from the server-side baseline; adding/changing foreign sections or reordering protected sections is denied, while omitted protected sections are restored automatically. Foreign-only Drafts are concealed with `404`; unauthorized payload changes return `403`; publish compares protected sections with the prior Published version. Mixed Staff/Coordinator scope cannot borrow Coordinator scope for Staff-only writes. Regression proves denial leaves source unchanged, mixed-scope sections survive a scoped version update, and scoped/tenant-wide Staff can create, update, and publish authorized content. OpenAPI error contracts and generated client match runtime. Full `pnpm verify` exited 0: API 287/43 files, Worker 34/11, Web 59/17, packages, infra 1, E2E foundation 1, Playwright 4; format, OpenAPI check/lint, lint, typecheck, all tests, and production builds passed. Full AUTH-004 matrix and Production gates remain open; no live DB/provider, deployment, commit, or push.

Latest verified increment (2026-09-27): reminders now work for both `pending` and `inProgress` assignments only when the existing invitation is active, belongs to the assignment's evaluator, and remains within its deadline. Generic campaign and targeted-email flows use the same validation; an invitation with no prior record remains an initial request, not a reminder. Regression first reproduced `ASSIGNMENT_NOT_EDITABLE`/`ACTIVE_INVITATION_REQUIRED` for a pending assignment, then passed isolated Mongo outbox checks proving reminder keeps invitation version, deadline, and assignment status unchanged. UI no longer trusts legacy Student status for mail actions or labels workflow conflicts as SMTP failure; it explains request/reminder/reissue choice. Full `pnpm verify` exited 0: API 286/43 files, Worker 34/11, Web 59/17, packages, infra 1, E2E foundation 1, Playwright 4; format, OpenAPI check/lint, lint, typecheck, all tests, and production builds passed. No real DB/provider, deployment, commit, or push. Production gates remain open.

Latest verified increment (2026-09-27): Student dashboard previously preferred any historical `submitted` assignment over a newer assignment for the same Student, so a completed old cycle could hide current `pending`/`inProgress` state and expose the wrong result. It now selects the Student's newest valid `createdAt` assignment; invalid timestamps fail closed and foreign Student rows are ignored. Regression first failed with the old submitted row, then passed for newer pending and malformed/foreign data. Full `pnpm verify` exited 0: API 284/43 files, Worker 34/11, Web 57/16, all packages, infra 1, E2E foundation 1, Playwright 4; formatting, OpenAPI, lint, typecheck, all tests, and production builds passed. No real DB/provider, deployment, commit, or push. Production gates listed below remain open.

Earlier AUTH-004 iteration (2026-09-27): `AccessGuard` required one role to independently satisfy a route's full required/any-permission policy and filtered request `roleScopes`, but still preserved the full actor role list. The latest AUTH-004 increment above supersedes that behavior by projecting both actor roles and scopes. The earlier guard regression covered permission-combination denial and scope-pair preservation. At that time, full `pnpm verify` exited 0: API 284 tests/43 files, Worker 34/11, Web 55/15, packages, infra 1, E2E foundation 1, Playwright 4. Production configuration and external release gates remain open; no live DB/provider or deployment.

Latest verified increment (2026-09-27): evaluator PIN hashes are now versioned (`v2`) and keyed with `INVITATION_TOKEN_PEPPER`, independent from the JWT signing secret. New invitation delivery and Development seeds write v2; PIN verification accepts both v2 and legacy JWT-keyed hashes so existing invitations remain usable. Runtime config rejects identical JWT and invitation secrets. The Mongo replica-set end-to-end flow first reproduced the old hash, then verified Worker delivery, new PIN login, and legacy PIN compatibility. Full `pnpm verify` exited 0: API 271 across 42 files, Worker 34, Web 55 across 15 files, packages, infra test 1, E2E foundation 1, Playwright 4, OpenAPI/format/lint/typecheck/build gates. No real mail/data/storage, deployment, commit, or push used. All-role scope matrix and isolated Redis/object-storage recovery drills remain open; Production is still blocked on real MFU OIDC/UAT, approved secrets/infrastructure, migration rehearsal, official PDF assets/UAT, backup/restore, monitoring/ownership, and operational sign-off.

Latest verified increment (2026-09-27): user-directory authorization now discards roleScopes whose role is absent from the actor's active role list. Regression reproduced that a Student actor carrying a stale Internship Staff scope received a staff-scoped user query; it now falls back to the Student's own account, and the stale scope cannot authorize assignment visibility. User-management policy and Mongo scope suites passed 13/13. Full `pnpm verify` exited 0: API 272 across 42 files, Worker 34, Web 55 across 15 files, packages, infra test 1, E2E foundation 1, Playwright 4, OpenAPI/format/lint/typecheck/build gates. No live data/services, deployment, commit, or push used. Full cross-domain all-role matrix and external Production gates remain open.

Latest verified increment (2026-09-27): Development Compose previously published unauthenticated Redis on every host interface (`host_ip: null`, `6380:6379`) while disabling protected mode. Port now binds to `127.0.0.1:6380`; a regression was reproduced before the fix and added to root `pnpm test`. `docker compose config -q` passes; rendered config confirms loopback host IP. Full `pnpm verify` exited 0: API 270 across 42 files, Worker 34, Web 55 across 15 files, package suites, infrastructure test 1, E2E foundation 1, Playwright 4, OpenAPI/lint/typecheck/build gates. Docker daemon unavailable, so containers and restart recovery were not run. No Production services/data, mail/storage, deployment, commit, or push used.

Latest verified increment (2026-09-27): generic mutation audit events now include the actor's currently active role-paired School/Program scopes, so audit readers in those scopes can see in-scope events without cross-pair expansion. Inactive role assignments are excluded; actors lacking scoped role metadata use only the single-role verified scope fallback; public events remain unscoped. Regression reproduced missing scope, checks paired multi-role scopes, fallback, inactive-role exclusion, query-secret stripping, and public-event behavior. `pnpm verify` exited 0: API 270 across 42 files, Worker 34, Web 55 across 15 files, packages, E2E foundation 1, Playwright 4; format, OpenAPI check/lint, lint, typecheck, all tests, and production builds passed. Full all-role resource/state authorization matrix and external Production gates remain open. No application DB, real mail/storage, deployment, commit, or push used.

Latest verified increment (2026-09-27): Development seed no longer derives or stores predictable/plaintext evaluator PINs; it creates random PINs and persists only keyed hashes, preserving an existing valid hash on rerun and unsetting legacy `accessPin`. The guarded evaluation fixture migration also unsets legacy plaintext after creating the hash. A regression test first failed because the hash-only helper was missing, then passed after implementation. Full `pnpm verify` exited 0: API 267 across 41 files, Worker 34, Web 55 across 15 files, shared-types 15, config 20, email-security 3, design tokens 1, validation 1, API client 2, E2E foundation 1, Playwright 4; format, OpenAPI check/lint, lint, typecheck, tests, and production builds passed. `pnpm audit` reports no known vulnerabilities. Environment validation: Development config passes and points to local MongoDB; Production config is invalid for Mongo/Redis/public API/OIDC URLs and SMTP encryption-key format (values were not printed or changed). Docker daemon is unavailable; installed Redis is 3.0.504 and unsupported by BullMQ. No application DB, real mail/storage, deployment, commit, or push used. Real MFU SSO/UAT, approved infra/secrets, migration rehearsal, official document assets/PDF UAT, backup/restore, monitoring, and operational sign-off still block release.

Latest verified increment (2026-09-27): School/Program archive now fails closed if its open-work guard is unavailable. Program archive is blocked by draft/active cycles or planned/active placements; School archive additionally requires every linked Program to be archived. Archive preserves historical records. Shared transactional School/Program revision locks serialize cycle, placement, Student scope-transfer/import, and linked Course writes against archive/reactivation. Regression covers active-work/history policy, missing guards, placement/Program-creation races, and cycle creation vs Program archive; exactly one side may commit. `pnpm verify` exited 0: API 263 across 40 files, Worker 34, Web 51, shared-types 15, config 20, email-security 3, design tokens 1, validation 1, API client 2, E2E foundation 1, Playwright 2; format, OpenAPI check/lint, lint, typecheck, tests, and production builds passed. `pnpm audit --prod` found no known vulnerabilities. No Production/dev application DB, real mail/storage, deployment, commit, or push used. Real MFU SSO/UAT, approved infra/secrets, migration rehearsal, official document assets/PDF UAT, backup/restore, monitoring, and operational sign-off still block release.

Latest verified increment (2026-09-26): Course creation no longer invents `courseCode` from `Date.now()` when omitted or blank; API returns `422 VALIDATION_ERROR`. Regression first reproduced the fallback, then covers missing/blank rejection and supplied-code trimming/defaults. OpenAPI `CourseInput`/`Course` now matches runtime and generated client. Isolated Mongo replica-set tests prove normalized School and Course codes are globally unique, Program code is unique per School, and duplicate-key API errors map to `409`. Full `pnpm verify` exited 0: API 258 across 40 files, Worker 34, Web 51, E2E foundation 1, Playwright 2, packages, format/OpenAPI/lint/typecheck and production builds. External Production gates remain unchanged; no live service/data, deployment, commit, or push used.

Latest verified increment (2026-09-26): Academic Term archival now fails closed if its reference guard is unavailable and returns `409 ACADEMIC_TERM_HAS_OPEN_WORK` for draft/active cycles or planned/active placements. Cycle creation/activation and placement creation increment the term revision in their own transaction; archive compare-and-sets that same revision, preventing a concurrent archive/reference race. Isolated Mongo tests cover blocked/allowed archive states, missing guard dependencies, version locks, and concurrent archive vs placement creation. OpenAPI now documents the guard's `503` failure. `pnpm verify` exited 0: API 254, Worker 34, Web 51, E2E foundation 1, Playwright 2, package suites, format/OpenAPI/lint/typecheck and production builds. MFU SSO, production infra/secrets, migration rehearsal, approved assets/UAT, backup/restore, monitoring/ownership and formal UAT remain external blockers. No live service/data, deployment, commit, or push used.

Latest verified increment (2026-09-26): removed writes/defaults for the legacy Student `evaluationStatus` projection; evaluation state remains canonical on cycle-scoped Assignments, with compatibility status computed only in scoped list responses. Import/development seeds no longer invent initial workflow state, Student JSON suppresses legacy projection values, and the flow-test summary counts distinct Students from submitted Assignments. Isolated-Mongo regression covers Submit, rollback at draft cleanup, import, and stale legacy values. `pnpm verify` exited 0: API 251, Worker 34, Web 51, E2E foundation 1, Playwright 2, package suites, format/OpenAPI/lint/typecheck/build. Real MFU SSO, approved infrastructure/secrets/assets, migration rehearsal, backup/restore, monitoring/ownership, and formal UAT still block Production. No live services/data, deployment, commit, or push used.

Latest completed increment (2026-09-26): competency reads and assignment snapshots now enforce matching School/Program scope; cycles reject published versions with no applicable questions. Regression covers scope filtering, no-match denial, and cycle activation refusal. `pnpm verify` exited 0: API 245 across 38 files, Worker 34, Web 51, package suites, E2E foundation 1, Playwright 2, formatting, OpenAPI, lint, typecheck, and production builds. Production blockers remain unchanged; no Production services/data, external mail/storage, deployment, commit, or push used.

Latest verified increment (2026-09-26): email template creation now atomically writes its template and first Draft version; an injected version-save failure previously left one orphan template and now rolls back both records. Duplicate codes return `409 TEMPLATE_CODE_ALREADY_EXISTS`. Controller-to-isolated-Mongo tests cover create/sanitize/publish/immutability, invalid placeholders, duplicate code, and rollback. Preview review found fixed synthetic examples in template settings; the invitation modal only interpolates the explicitly selected Student/Evaluator, while campaign preview returns counts and issue codes—not arbitrary records. Full `pnpm verify` exited 0: API 249 across 39 files, Worker 34, Web 51, package suites, E2E foundation 1, Playwright 2, OpenAPI checks, formatting, lint, typecheck, and production builds. No application DB, real mail/storage, deployment, commit, or push used. `Retired` transition remains open because Worker rejects queued deliveries when a template ceases to be `published`; define queued-delivery behavior before exposing retirement.

Latest access refinement (2026-09-26): Student competency reads now expose only Published versions in the assigned School/Program scope; Evaluator cannot call generic competency reads and continues through the assignment snapshot. Regression confirms Students cannot read Draft versions, Staff can read Drafts in scope, and Evaluator lookup is denied. Latest full `pnpm verify` exits 0 with API 245 and all workspace/browser/build gates passing.

Next safe engineering tasks: finish the record-level all-role resource/state matrix and cross-domain business E2E; then extend worker tests to SMTP-capture and private object-storage adapters. Mongo+Redis restart, lease recovery, idempotency, and uncertain-delivery behavior are covered in CI; real provider behavior remains unverified. `FND-007` is complete. Email-template retirement is not exposed through the API and is a feature gap, not an enabled workflow; define queued-delivery behavior before adding that transition. MFU SSO configuration and Production infrastructure remain release blockers.

Previous verification before competency-scope updates (2026-09-26): `pnpm verify` passed after route authorization contracts, scoped audit hardening across Student/Academic/Organization/Evaluator/Placement mutations, and Course reference guards. API 244 tests across 38 files; Worker 34, Web 51, package suites, E2E foundation 1, Playwright 2, OpenAPI, formatting, lint, typecheck, and production builds passed. Scoped mutation events derive from verified School/Program/Placement references; Student and Academic writes plus Organization/Evaluator/Placement creation persist audit rows transactionally. Student CRUD/scope suites pass 46/46. Generic Course PATCH cannot remove Program applicability or archive the Course without a coordinated migration; additive applicability works. Full resource/state role matrix, scoped mutation events in other domains, supported Redis recovery drills, real MFU SSO/UAT, approved production infrastructure/assets, migration rehearsal, backup/restore, monitoring, and operational sign-off remain open. No Production services/data, external mail/storage, deployment, commit, or push used.

Latest evidence (2026-09-26): delivery correspondence is now reachable in the app, the API masks recipient addresses and strips Worker/provider internals, Coordinator delivery-row access is explicitly denied, and retry requires an actor-bound idempotency key with transactional retry intent and audit. Access JWT logout/revocation now takes effect immediately through hashed persisted-session checks on every protected request; active roles are re-resolved and legacy unbound access tokens are rejected. Cookie-auth CSRF guard and actual CORS preflight/PUT integration tests cover trusted and foreign origins plus all mutation verbs. Invitation PIN/token links now carry credentials in URL fragments, with legacy query links scrubbed before exchange; browser smoke confirmed secret-free address bar/request URL. Dashboard reads every page and fails closed on unstable totals; 1,001 synthetic Students appeared and the final row was searchable. Student document access now has scoped/audited downloads and Redis quotas protect PDF generation. Student Certificate/Transcript requests now precheck unique published templates, use complete current evaluation sources from one completed placement, post with stable idempotency keys, and refresh queued/ready status; production-built browser smoke used isolated mocks only. Student archive protection checks canonical Mongo ID and Student number; regression reproduces and prevents archive racing with placement creation. Archive and scope transfer recheck transactionally; placement/assignment creation serialize through the Student Mongo version key. Assignment creation rejects completed/cancelled placements. Scope helpers now ignore role-scope entries absent from current active roles. Production OIDC config rejects HTTP issuer and redirect/callback URLs. Both Compose web services now use the private API service URL for SSR. Academic Term PATCH validates merged dates and compare-and-sets the original date pair; Program PATCH rejects School reassignment that lacks a coordinated migration. The latest full `pnpm verify` passes with API 225, Worker 34, Web 51, config 20, package suites, Playwright 2, and production builds; latest `pnpm audit --prod` reports no known vulnerabilities. No application database, real SMTP/object storage, deployment, commit, or push was used. Production release gates below remain open.

Previous snapshot (2026-09-26): API 225 verification before route-authorization contract coverage. Program–School integrity, Academic Term compare-and-set, Student archive/scope protection, active-role filtering, Production OIDC URL validation, Compose SSR routing, Student document access, and PDF request coverage are recorded in `AI_HANDOFF.md`.

Latest verified increment (2026-09-25): audited report-export jobs are implemented end to end: scoped/idempotent API requests, immutable selected-field snapshots, audited status/download access, expiring private download links, CSV formula-injection protection, asynchronous Worker processing/recovery, and guarded index migration. Isolated Mongo replica-set/API and Worker tests cover scope, replay/conflicts, audit rollback, snapshot immutability, signing, CSV safety, processing/retry, and migration idempotence. Full `pnpm verify` passes (API 182, Worker 34, Web 33, shared-types 15, config 18, and package suites); `pnpm audit --prod` reports no known vulnerabilities. Migration was not applied to any application database; no Production/dev database, SMTP, S3, deployment, commit, or push was used. Redis compatibility parsing and readiness also require Redis major >=5, `PONG`, and valid server version metadata; no queue commands were sent to the installed Redis 3.0.504 service.

Latest verified increment (2026-09-25): evaluator draft reads are now limited to actors allowed to edit evaluations; students can see no draft before submit and can read their final result after submit. Staff student details now load the selected assignment's persisted category scores/answers and do not synthesize cohort comparisons or cross-category totals. Student directory no longer derives internship years from admission year/student number or silently selects the first course/term/placement. Legacy onboarding import now records only confirmed API successes, retains failed rows for correction, and removes guessed school/program/semester/year defaults; demo rows are Development-only. The downloadable workbook template is headers-only. Added Mongo and Web regression coverage. Full `CI=true pnpm verify` passed after correcting a Vue template build issue; no DB, SMTP, object storage, deploy, commit, or push used.

Latest verified increment (2026-09-25): assignment creation now checks both canonical Student record ID and student-number alias within the cycle, and a unique `(cycleId, studentId)` index closes concurrent duplicate creation. The guarded assignment-index migration reports duplicate `(cycle, student)`, unresolved reference, and non-canonical alias counts, redacts Student identifiers, and blocks applying that index until data is safe; tested on isolated MongoMemoryServer only. Staff directory now fetches cycles/terms, defaults only for one active cycle, requires cycle context to display evaluation status, uses that cycle's Academic Term rather than a potentially stale profile projection, and displays an error state rather than “pending” when cycle/assignment data cannot be loaded. Added 23 API Mongo regression cases and 5 Web resolver tests. Final `CI=true pnpm verify` passes (API 163, Worker 20, Web 20, E2E 1 plus package suites). No local application stack was listening for browser verification; no live migration, DB writes, mail, storage, deploy, commit, or push occurred.

Evidence snapshot (2026-09-24): full `pnpm verify` passed after audit actor/scope filtering and index migration safeguards, trusted audit-scope snapshots, invitation/session version binding, transaction-safe finalization, report/scope regressions, import/reference hardening, and Nuxt response security headers. Latest suites: API 144, Worker 17, Web 14, shared-types 6, config 8, email-security 3, design tokens 1, validation 1, API client 2, and E2E 1. A local production Nuxt preview returned HTTP 200 with `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, and `Permissions-Policy: camera=(), geolocation=(), microphone=()`; CSP/HSTS and edge/TLS policy remain deployment-specific gates. Both `pnpm audit` and `pnpm audit --prod` report no known vulnerabilities. Student import is actor/scope-bound, validates master references and duplicate IDs/emails, shows diffs, requires explicit update confirmation, commits per row transactionally with audit, and resumes from stored outcomes. Data scope queries preserve each role assignment’s school/program pairing; Student/Placement mutations enforce linked records and current scope; Academic School/Program/Course reads and writes honor actor scope. Student update/archive checks source scope, and generic transfer/archive is blocked while placement or evaluation work is open. Historical placements and assignments are not rewritten by profile scope edits. Student email uniqueness and canonical term references are enforced for new writes. Organization/evaluator directories derive access from visible placements; Student sees only their assigned evaluator; global Organization creation is tenant-only. Generated-document reads follow Student scope rather than requester identity. Reports apply term/school/program filters in conjunction with actor scope and calculate assignment, delivery, student, and document totals through Mongo aggregation; optional filters are not yet wired into dashboard controls, and load/performance targets remain unverified. Audit reads use only the caller’s active role scopes, preserve each School/Program pair, and omit actor email; legacy unscoped events remain self-only. Submit integration tests prove missing required answers, out-of-scale scores, and wrong-type ratings fail without partial workflow writes. A read-only email duplicate profiler and guarded unique-index migrations were tested only on isolated Mongo replica sets. Development `.env` passes runtime validation and points to local MongoDB. Production `.env` still fails validation for required URL/OIDC fields and the SMTP settings encryption key; do not deploy until approved real values are provisioned through secrets management. Production readiness rejects MongoDB without transaction capability. Docker daemon is unavailable, so container builds and live Redis/provider recovery remain unverified; MFU OIDC/UAT and production operations remain external blockers. Email/audit index migrations remain unapplied to real data. `In Progress` means implementation exists but one or more acceptance/validation items still lack evidence.

Latest verified increment (2026-09-24), superseding the counts above: `pnpm verify` passes with API 151, Worker 20, Web 14, and E2E 1 plus package suites. Global province and general-settings mutations now require `system.config.manage`; Internship Staff's scoped `academic.manage` permission cannot mutate tenant-wide settings. Document generation rejects missing, non-submitted, superseded, stale-revision, or cross-Student evaluation sources at both API and Worker; scoped staff document and correspondence writes ignore unrelated Coordinator scope; OpenAPI/generated client match runtime, and public document JSON redacts internal requester, idempotency, and storage fields. The built Nuxt preview returns HTTP 200 with the four configured security headers. CSP/HSTS, edge/TLS review, full all-role scope matrix, isolated end-to-end business flow, real staging/SSO/secrets, production migrations, official document assets, S3/PDF visual UAT, backup/restore, monitoring, and operational sign-off remain open.

Latest verification (2026-09-26, after AUTH-004 evaluation-list scope and DATA-002 archive regressions): `pnpm verify` exited 0 with API 218 across 36 files, Worker 34, Web 49, all package suites, Vitest E2E foundation 1 and Playwright Chromium 2, OpenAPI checks, formatting, lint/typecheck, and API/Worker/Nuxt production builds. Student CRUD/scope integration tests passed 25/25; archive guard now checks both Student number and canonical Mongo record ID, and generic PATCH shares the open-work archive rule. `pnpm audit` last found no known vulnerabilities. Non-fatal Nuxt plugin timing/Node `DEP0155` and Playwright `NO_COLOR` warnings remain. Browser UI tests mock API calls; isolated API/Mongo/Worker business-flow tests remain separate. Docker daemon is unavailable; hosted CI run, live provider recovery, real MFU SSO/UAT, production data migration, approved PDF assets, backup/restore, monitoring, and operational sign-off remain open.

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
- Implemented proof: root lint/type/test contracts exercise intentional failures; Nuxt Web consumes the shared typed ESLint policy for application TypeScript and enables type-aware async safety rules for Vue files. `tests/infra/quality-gate-contract.test.mjs` verifies rule parity and `.vue` parser configuration, plus intentional lint/type failures. Web lint and typecheck pass; full local `pnpm verify` passes on 2026-09-28, including Playwright 12/12 and Production builds. No lint finding was suppressed to make the gate pass.
- Remaining: hosted CI execution remains unverified. The latest full local `pnpm verify` ran with isolated Redis 8 and MongoDB replica sets and had no skipped tests. An earlier Windows ARM64 native-binding failure was superseded by successful runs without policy bypass.

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
  - Production accepts only MongoDB/Redis service URI schemes, requires MongoDB TLS, `rediss://` Redis, and HTTPS S3;
  - Production public/OIDC/S3 URLs reject loopback; CORS accepts exact HTTPS origins only;
  - public Nuxt config contains no server secrets.
- Validation: startup tests cover missing values, local Development, complete Production-shaped configuration, unresolved placeholders across OIDC/SMTP/S3, invalid service URL schemes, standard MongoDB TLS flags (`tls`/`ssl`), SRV MongoDB explicit TLS disablement, MongoDB TLS certificate/hostname-validation bypass flags, Redis TLS, S3 HTTPS, HTTPS OIDC URLs, loopback rejection including IPv6, and exact Production CORS origins. Placeholder scanning preserves a valid sender display name such as `Name <email>`. Latest `pnpm verify` exits 0: API 297/44 files, Worker 35/12, Web 59/17, config 39/3, shared-types 15/3, email-security 3/1, design-tokens 1, validation 1, API-client 2, infra 1, E2E foundation 1, Playwright 4; formatting, OpenAPI, lint, typecheck, tests, and Production builds pass. Current workstation metadata confirms Development MongoDB is local; Production env files still contain unresolved required values and are not deployable.

### FND-004 — Local infrastructure

Current release-image integration: manual publisher now emits exact GHCR digests with BuildKit provenance/SBOM and Cosign verification; Production wrapper verifies signatures before pull/up. GitHub Environment protection, GHCR operation, and actual container runtime remain unverified outside this repository.

- Status: `In Progress`
- Priority: `P0`
- Depends on: `FND-003`
- Scope: Docker Compose for MongoDB, Redis, Mailpit/capture SMTP, optional local S3 emulator.
- Security: unauthenticated Development Redis publishes only on `127.0.0.1:6380`; root regression fails if binding widens.
- Acceptance:
  - one command starts local dependencies;
  - health checks defined;
  - data volumes named and documented;
  - no real recipient can receive Development email by default.
- Validation: Development `docker compose config --quiet` passes. Compose gates API on MongoDB/Redis/MinIO initialization and healthy Mailpit, and gates Worker/Web on healthy API; API, Worker, Web, and Mailpit probes are declared. MinIO initialization fails clearly after bounded 120-second wait. Production Compose defaults API/Web host binds to loopback, leaves Worker unpublished, and requires auth/mail/database/storage settings; regression locks those invariants. Infrastructure Compose contract tests pass 14/14 and `pnpm test:contracts` passes 19/19 (includes 2 quality-gate and 3 DOC-102 schema-adapter contracts); they cover digest-only runtime, no build fallback, separate tagged build manifest, ref rejection, wrapper allowlist, quiet config, and no-build deployment. A process-local fake secret sentinel appears in plain Compose `config` output and does not appear in `config --quiet` output; the runbook requires the wrapper and edge CSP/TLS review before traffic. Synthetic runtime/build configs pass without connecting to services. A protected-main manual workflow now publishes, scans, signs, and verifies digest-pinned images after quality/security gates, but no run or approved image refs exist yet. Actual container startup, provenance verification, probes, and shutdown/restart recovery remain unverified; local Docker Engine is unavailable.

### FND-005 — CI quality gates

Current release-image integration: `.github/workflows/publish-images.yaml` is manually dispatched from protected `main`, confirmation-gated, quality-gated, scans the exact published digest, then signs and verifies it. GitHub-hosted execution, Environment reviewers/branch protection, and registry permissions remain external validation gates.

- Status: `In Progress`
- Priority: `P0`
- Depends on: `FND-002`, `FND-007`
- Acceptance:
  - frozen install, lint, typecheck, unit/integration, OpenAPI validation, build;
  - secret, dependency, SAST, and container scanning;
  - generated artifacts checked for drift;
  - no deployment or external write from pull-request jobs.
- Implemented: pull-request/push pipeline uses frozen install, runs `pnpm audit` and `pnpm verify`, builds API/Worker/Web images with `push: false`, scans repository history for secrets, runs CodeQL JavaScript/TypeScript analysis, and scans every built image for HIGH/CRITICAL OS/library vulnerabilities. PR jobs do not write build/package caches or SARIF artifacts; only trusted `main` pushes write those workflow artifacts/caches. Third-party actions are pinned to immutable commit SHAs; no deployment is configured.
- Validation: `pnpm audit --prod` reports no known vulnerabilities. Local lint/type fixtures prove rejection; full `pnpm verify` now passes on this workstation with isolated Redis 8 and MongoDB replica sets and no skipped tests. GitHub-hosted run, CodeQL finding triage, branch protection, and failing-branch proof remain open. Gitleaks requires an approved `GITLEAKS_LICENSE` secret for organization-owned repositories; personal repositories do not require it. An earlier Windows ARM64 Rolldown failure was superseded by successful runs without policy bypass.

### FND-006 — Error contract, request IDs, logging, and audit foundation

- Status: `In Progress`
- Priority: `P0`
- Depends on: `FND-001`, `FND-003`
- Requirements: security/observability NFRs
- Acceptance:
  - standard error shape `code`, `message`, `details`, `requestId`;
  - request ID propagated through API and queued job;
  - logger redacts tokens, cookies, URIs, credentials, and configured PII;
  - high-impact user/role mutations and other critical business events are durably audited with target/scope metadata; failed audit persistence has a recovery or alert path.
- Validation: request/error contract and redaction tests pass. User create/role update/archive, evaluation submit, document-generation request, invitation reissue, and PDF `ready` issue event write audit in the same transaction as their business state outside Development; rollback/idempotency tests cover these paths. Generic mutation events now attach only active, role-paired scopes and strip query strings; regression covers paired roles, inactive-role exclusion, and public events. Trusted resource scopes flow to role-paired audit filtering; actor email is omitted from API responses. API/OpenAPI use actual audit filters and response shape. Audit scope indexes have an idempotent, dry-run-first migration; it requires `AUDIT_SCOPE_MIGRATION_URI` and exact `--confirm-db=<database>` for `--apply`, and has only run against isolated Mongo in tests. Generic audit writes retry three times and emit sanitized `AUDIT_PERSISTENCE_FAILED`; Student import also audits within its transaction. Production indexes remain unapplied.

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
- Validation: isolated schema/index tests prove case-sensitive `{ oidcIssuer, oidcSubject }` uniqueness, same-subject identities under distinct issuers, and uniqueness of unlinked pre-created subjects. The OIDC index migration dry-run/apply/idempotent rerun and duplicate/malformed-data blocking pass on disposable MongoDB; production migration remains unapplied pending reviewed-backup rehearsal.

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
- Blocking decisions: owner-supplied MFU issuer/client ID, verified claims and allowed domains, role mapping, logout, key rotation, and staging/UAT. The account-link policy is decided and implemented: System Admin maps a pre-created account to the exact case-sensitive subject from the configured/discovered issuer, with a required reason, transactional audit, and actor/operation/target/payload idempotency. The issuer is not client-controlled; email-only auto-link is not allowed.
- Production staff/student access must remain blocked until real MFU SSO and controlled account linking pass staging/UAT. Existing records without `oidcIssuer` do not authenticate by subject alone; create and rehearse an explicit mapping for each account before cutover.
- The identity index cutover is explicit: profile with `OIDC_IDENTITY_INDEX_MIGRATION_URI` in read-only mode, resolve any duplicate/malformed identity groups, then apply only with an approved window, backup, and exact `--confirm-db` value. The migration creates the case-sensitive issuer-subject compound unique index before removing the old globally unique subject index.
- Production runtime validation requires HTTPS for both the issuer and redirect/callback URI; config regressions reject HTTP for either value. This verifies configuration shape only, not the live MFU provider or claim mapping.
- Isolated OIDC service contract tests verify S256 PKCE creation, matching state/nonce/verifier storage and callback exchange options, and reject code-exchange failures or unverified email before account mapping. Controlled-link tests verify the trusted discovered issuer, non-admin rejection, exact subject matching, transactional audit rollback, idempotent replay, and conflict/rebind denial. Mock tests prove application wiring only; they do not validate MFU discovery metadata, real token signatures/claims, logout behavior, or production session expiry.
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
- Validation: explicit exact-set regression covers every role's granted permissions and rejects silent privilege drift. AccessGuard regression reproduced and fixes a fail-open where `@Authenticated()` suppressed explicit `@RequirePermissions()` metadata. Isolated Mongo regression confirms user-directory role/school filters and per-role summary counts match the same in-scope role assignment; User schema role enum initializes with explicit BSON type. Audit reads use the caller's active `audit.read` role scopes without merging multi-role scope pairs; forged non-admin `actorId` filters are ignored, tenant readers see only explicitly scoped records, and actor-owned unscoped history remains visible. User, import, evaluation submit, invitation reissue, and generated-document request/issue events now persist trusted resource scopes. Generic mutation audit events attach active role-paired scopes, strip query strings, and leave public events unscoped; regression covers multi-role pairing and single-role fallback. Access JWTs bind to hashed persisted sessions; every guarded request checks session expiry/revocation and resolves current active roles, so logout/revocation and role removal take effect immediately. Cookie-auth CSRF tests exercise `POST`, `PUT`, `PATCH`, and `DELETE`; API CORS integration proves credentialed `PUT` preflight and trusted-origin mutation pass while foreign-origin mutation receives `403`. Isolated Mongo Student/Placement read scope covers six-role list/detail and widening attempts. Organization/Evaluator directory matrix now verifies all six roles: tenant System Admin, scoped Staff/Coordinator/Auditor, Student own-placement data, and Evaluator denial. Generated-document tests verify scoped reads and direct-ID `404` concealment across Staff/Coordinator/Auditor/Student boundaries; Evaluator is denied list/detail/download. Evaluation assignment-list regression reproduced Student `studentId` query overriding own scope; actor scope and request filters now combine with `$and`, proving cross-Student ObjectId queries return no rows. Runtime `AccessGuard` matrix now exercises every registered non-public route for each of the six roles and requires `401` without a session; record-level scope and complete business-state matrix remain open.

- Additional regression: the route contract discovers registered controllers from all API feature modules; every endpoint must declare access metadata, public endpoints must match the explicit allowlist, and non-public mutations require permission except authenticated logout. Contract tests pass 6/6, including the runtime route × six-role grant/deny cross-product and unauthenticated `401` checks. This does not replace the open all-role resource/state matrix.

### AUTH-005 — External invitation and evaluator session

- Status: `In Progress`
- Priority: `P0`
- Depends on: `AUTH-004`, `EVL-003`
- Requirements: `FR-AUTH-003`
- MVP policy: deadline-bound invitation; reminder reuses the same invitation/PIN; no reopen; reissue revokes the prior invitation/session without extending deadline.
- Acceptance:
  - token stored hashed, signed/unguessable, expiring, revocable, assignment-bound;
  - evaluator access/refresh session binds to invitation ID/version and is rejected after revoke, expiry, reissue, assignment change, or submit;
  - reissue requires a reason and idempotency key, writes audit atomically, and does not rotate deadline;
  - token is not in query/fragment-free request URLs, logs, analytics, or Referer; new links carry it only in the URL fragment and the client strips it before API exchange;
  - exchange creates least-privilege evaluator session;
  - expired/revoked/cross-assignment tests pass.
- Implemented: API supports audited versioned reissue; the evaluation UI exposes it for pending/in-progress assignments, requires a 5–500 character reason, uses the registered evaluator email, and reports queue acceptance separately from delivery. Worker drops stale invitation-version jobs; reissue clears prior PIN hashes and revokes matching refresh sessions transactionally. API and Worker-generated email links plus direct PIN links use URL fragments; the UI accepts legacy token/PIN query parameters only long enough to strip them from browser history before exchanging credentials. `/evaluate` uses `Referrer-Policy: no-referrer`; upstream access logs still need query redaction for legacy URLs.
- Validation: isolated Mongo/worker tests cover current/revoked/missing evaluator bindings, reissue replay/conflict, refresh-session revocation, audit rollback, stale queued delivery, and assert token placement in both API-generated and fake-SMTP HTML/plain-text email links; the emailed signed token is then exchanged in the end-to-end isolated flow. Web tests cover PIN fragment generation, legacy/new link parsing, duplicate-parameter rejection, and legacy invitation URL canonicalization. Production browser smoke verified address-bar/request-URL credential removal before exchange (the deliberately invalid synthetic token received mocked `401`) and `no-referrer` on the legacy route. Latest full `pnpm verify` after the API and Worker link correction passes (API 206, Worker 34, Web 44). Real provider delivery and MFU SSO remain external gates.

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
- Validation: Academic list filters preserve role-assignment pairing; Programs/Courses are limited to permitted School/Program refs; staff master-data writes are scope-checked and tenant-only operations are restricted. Replica-set tests cover scope and linked Academic references. Course creation requires a nonblank `courseCode`; it no longer fabricates one, and OpenAPI/client match the runtime contract. Isolated tests verify School/Course global uniqueness, Program uniqueness within School, and `409` mapping for duplicate keys. Academic Term, School, and Program archives block open cycles/placements; School additionally requires child Programs archived. Shared transactional revision locks serialize new cycle/placement and other scoped-reference writes against lifecycle changes, while historical records remain unchanged. Race and fail-closed guard tests pass; DATA-001 remains in progress for its remaining acceptance and rollout evidence.
- Latest UI integration: real academic Terms now load from the API and can be created, edited, opened, or closed with pagination and explicit loading/error/empty states.

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
- Validation: regression coverage includes paired role scopes, staff-only mutations, Student PATCH, open-work transfer/archive rejection, historical snapshots, case-insensitive CRUD email uniqueness, duplicate profiling, guarded unique-index creation, canonical term create/update, School/Program/Course references, Placement Student/Organization/Term consistency, active Organization requirement for Evaluator creation, duplicate evaluator handling, and out-of-scope denial. Real-data duplicate resolution and applying the email index migration remain open; organization/evaluator lifecycle and migration profiling remain in progress.

### DATA-003 — Student bulk import preview and commit

- Status: `In Progress`
- Priority: `P1`
- Depends on: `DATA-002`
- Requirements: `FR-MEM-002`
- Acceptance:
  - `.xlsx` and `.csv` uploads are limited to 5 MiB, 20 sheets, 200 columns, and 1,000 student rows; `.xls` is rejected;
  - server creates actor-owned 24-hour preview with normalized row hash and source checksum;
  - row-level create/update/unchanged/invalid diff, duplicate ID/email, unresolved School/Program/Course/Term, and scope errors are visible; no default master data is guessed;
  - question/score columns are detected for review but never written as evaluations;
  - commit accepts up to 100 explicit row decisions with actor/operation-scoped idempotency; each student write, row outcome, and audit event commit atomically;
  - stale updates conflict; update requires per-row confirmation; partial outcomes can be safely resumed;
  - full production release waits for DATA-002 email-uniqueness profiling/index migration and staging integration.
- Validation: isolated MongoDB replica-set integration covers actor-owned previews, no-write preview, duplicate identity/reference handling, confirmed create/update, stale Student version conflict, per-row rollback/idempotent retry, and stale School/Program/Course/Term revalidation inside the commit transaction. Parser/service tests cover CSV, `.xls`/malformed/oversize rejection, 20-sheet/200-column/1,000-row limits, and score-column detection without final evaluation writes. Nuxt UI commits in chunks of at most 100, retains idempotency keys, refreshes durable outcomes, and allows safe retry. Targeted import suite: 17 tests; latest full `pnpm verify`: API 144, Worker 17, Web 14, E2E 1 plus package suites. Additional Edge browser smoke verified the built-app directory and import-preview UI with synthetic mock responses; no commit request was sent. Browser smoke does not replace backend import integration. Staging integration and production email-index migration remain open.

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
  - one assignment per Student per cycle, enforced by unique `(cycleId, studentId)`;
  - legacy Student-number aliases are resolved during create and profiled before index migration;
  - question/scoring snapshot created from cycle version;
  - assignment ownership drives evaluator access;
  - duplicate concurrent creation cannot produce two active assignments.
- Validation: isolated replica-set duplicate/canonical-alias tests; guarded migration dry-run for duplicate, unresolved, and non-canonical references.
- Latest validation: isolated MongoDB replica-set race submits two simultaneous assignment-create requests for the same canonical Student/cycle and confirms exactly one assignment plus one creation audit; the losing request returns `409 ASSIGNMENT_ALREADY_EXISTS`. Targeted suite: 18 tests passed. Migration dry-run was not run against application data.

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
- Validation: isolated Mongo replica-set regression verifies sequential saves, persisted resume state, stale revision `409 VERSION_CONFLICT` without overwriting, cross-evaluator `404`, expired-assignment `409 ASSIGNMENT_NOT_EDITABLE`, and closed-cycle `409 CYCLE_CLOSED`, all without unauthorized/expired/closed writes. Targeted evaluation suite: 20 passed. Playwright Evaluator flow also verifies save/retry/resume and submit UI; it stubs API calls, while backend state is proven separately by Mongo integration.

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
- Validation: isolated replica-set tests verify draft/final transaction, category score projection, idempotent replay/payload conflict, concurrent identical submit, cross-owner denial, orphan-reference rejection, rollback after later workflow or audit writes fail, one audit event per final submission, missing required answers, out-of-range scores, and wrong answer types. Broader actor/state cases remain in the regression matrix.

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
- Validation: Playwright Chromium covers PIN, 360px no-overflow, keyboard rating, draft save failure/retry, resume after reload, required-answer guard, submit carrying `Idempotency-Key`, final read-only reload, safe assignment-load error, and generic expired/revoked/submitted PIN denial without assignment fetch. Isolated Mongo business flow verifies the real `InvitationService` denies expired/revoked invitations and submitted assignments using the same `401 PIN_INVALID` response. Regression reproduced and corrected submitted PIN's missing user-safe message; invalid PIN causes now share one generic message. Earlier submit-confirmation copy also promised Staff could reopen despite MVP policy; it now states submitted results are locked and not editable. Browser API is mocked; backend business flow separately uses isolated Mongo replica set and fake SMTP/storage. Formal accessibility audit and broader UI permission-state matrix remain open.

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
- Implemented: API sanitizes template HTML on create/update/publish/read; Worker escapes substituted values and sanitizes immediately before sending; browser previews use sandboxed iframe plus restrictive CSP. Template plus initial Draft creation is transactional; duplicate codes return `409`. Regression tests reject script/event-handler/javascript/CSS URL payloads while preserving allowed styles and invitation placeholders.
- System template GET is read-only and returns in-code defaults before first persistence; invitation flows transactionally ensure the durable published version, and system-template edits commit template/version together. Production unique indexes are explicit-collation and provisioned by the dry-run-first `migrate:email-template-indexes` command; migration blocks on duplicate/malformed rows and requires exact DB confirmation for apply.
- Validation: isolated Mongo/controller workflow covers create, sanitize, publish, published immutability, unknown-placeholder rejection, duplicate-code conflict, and rollback on version-write failure. Privacy review: template settings uses fixed synthetic values; invitation preview uses only the Student/Evaluator explicitly selected for that intended invitation; campaign preview returns counts/issues without arbitrary Student records.
- Remaining: no API transition to `retired`; this workflow is not exposed to users and is a feature gap for MVP. Worker requires status `published` at send time, so do not mutate versions to `retired` directly. If a retire action is added later, first specify whether queued sends are cancelled or preserve the published campaign snapshot. Live provider/Redis integration remains under MAIL-004/OPS gates.

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
- Validation: Worker recovery tests cover pre-SMTP requeue, post-attempt uncertainty/no resend, legacy rows, API-before-enqueue interruption, duplicate queued-job suppression, and backlog pagination. Isolated Mongo replica-set tests verify stale delivery transitions, durable queued-intent recovery, atomic campaign/invitation/delivery creation for generic, targeted, direct, and reissue flows, rollback, and concurrent idempotent replay. Worker rejects stale invitation versions and updates PIN state atomically; campaign state reconciles from deliveries. The latest full gate runs Redis 8 + Mongo replica-set integration tests with no skips; Production Redis failover/provider behavior and controlled Production index migration remain open.

### MAIL-003 — Delivery monitoring and retry UI

- Status: `In Progress`
- Priority: `P1`
- Depends on: `MAIL-002`
- Requirements: `FR-MAIL-004`
- Acceptance:
  - Admin/Staff/Auditor can filter queued/sending/sent/failed/uncertain delivery rows within authorized scope; Coordinator gets summary only;
  - retry permission and actor-bound idempotency enforced for failed deliveries;
  - recipient PII minimized in list/log output.
- Implemented: restored the existing correspondence page and app navigation; delivery responses are allowlisted and email addresses masked; the API denies row-level access to summary-only Coordinators. Retry requires `Idempotency-Key`, persists actor/payload/resource/job identity and the delivery state change plus audit in one transaction, and relies on Worker recovery if queue insertion fails. UI exposes `uncertain`, limits retry controls to Admin/Staff, and retains the key for safe replay after a network error.
- Validation: isolated Mongo tests cover masking, Coordinator denial, replay/payload conflict, one durable retry/audit, queue insertion failure, and audit rollback; controller test covers required/normalized idempotency header. Edge browser smoke with local mock services verifies route, safe DTO rendering, `uncertain` state, retry error handling, and same-key replay. Full `pnpm verify` passes (API 188, Worker 34, Web 33, all package suites and production builds); OpenAPI generated-client check/lint pass. Staging browser/API against the real API and supported Redis/provider recovery remain release gates.

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
  - Development localhost/Mailpit enforcement and log/API redaction;
  - Production SMTP uses implicit TLS or requires STARTTLS; it cannot silently downgrade to plaintext.
- Remaining validation:
  - execute Mailpit end-to-end send on the complete Development infrastructure (Docker daemon unavailable here);
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
- Implemented: template plus initial Draft v1 are transactionally created; later Draft versions increment version number; Draft PATCH uses optimistic revision; Published is immutable; archived templates cannot spawn versions; list returns latest status/revision/metadata. Isolated Mongo replica-set tests cover rollback, version lifecycle, revision conflict, archive guard, and list metadata. Official asset/upload and renderer-publish verification remain open.

### DOC-102 — Nuxt Konva editor migration

- Status: `In Progress`
- Priority: `P1`
- Depends on: `DOC-101`
- Acceptance:
  - browser-only code isolated with client boundary;
  - create/edit/preview/publish flows use Nuxt UI;
  - legacy template adapter has fixtures and schema-version tests;
  - unsaved changes and destructive actions guarded.
- Implemented: Designer loads persisted API templates and saves Drafts through create/update/next-version endpoints; only System Admin/tenant-scoped Internship Staff can manage or publish shared tenant-wide templates after explicit confirmation. School/Program-scoped Staff and other read roles see active Published metadata/summaries only; they cannot load Drafts/canonical JSON/private asset keys, and the UI hides guarded management controls. API remains authoritative for canonical schema, placeholder, geometry, asset-rights/object, and verified-font checks. Unsaved drafts must be saved first; Published is immutable and later edits use a new Draft. PDF issuance remains disabled pending official assets/layout and visual UAT. Valid schema v1 text layouts adapt into schema v2 while preserving page dimensions; unknown/malformed schemas fail closed; local-only status/delete actions removed; closing with unsaved changes is guarded and persistence locks the editor. Browser regressions cover System Admin and tenant Staff publish plus Coordinator Published-only access (3/3). Latest `pnpm verify` passes, including Playwright 12/12 and all production builds. External UAT with approved templates/assets remains open.

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
- Implemented: document request persists requester/request ID and `documents.generation_requested` audit atomically. API and Worker require non-superseded final evaluations belonging to the same Student and current submitted assignment revision; public DTOs omit requester, idempotency, and storage internals. Worker uses deterministic object identity/checksum and changes document to `ready` with `documents.issued` audit in one Mongo transaction; audit failure rolls back the ready state so retry can reconcile the private object.
- Validation: API replica-set regressions cover no evaluation, pending assignment, stale revision, ID normalization, idempotency, audit rollback, DTO redaction, and paired-role scope isolation; Worker tests cover no source, unsubmitted assignment, and superseded result. Full `pnpm verify` passes (API 150, Worker 20, Web 14, E2E 1 plus package suites). Official Certificate/Transcript fonts, layout, signatures, complete editor schema, and approved-template PDF visual/UAT remain blockers; real S3/renderer integration is not proven.
- Renderer regression (2026-09-28): reproduced `custom_table` placeholders in headers/cells being emitted literally even though canonical validation allowed them. Worker now resolves table headers and cells through snapshot placeholder validation; regression verifies Thai name, Student ID, and no unresolved tokens. Latest full `pnpm verify` passes, including Worker/API/Web production builds and Playwright 9/9. DOC-103 remains blocked on approved official assets/layout and PDF visual UAT plus real private-storage/renderer verification.
- Font mapping integrity (2026-09-28): API extracts font family from uploaded bytes and displays it in the asset picker; new template publication rejects V2 element-family/embedded-font mismatches and requires metadata. Issue snapshots carry verified family metadata; legacy published assets without metadata remain issuable, while republishing requires verified/re-uploaded font. Parser and isolated Mongo regressions pass; the latest full `pnpm verify` passes. Approved MFU assets and PDF visual comparison remain external DOC-103 gates.

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
- Implemented: document metadata access audits concealed cross-scope/missing lookups using a constant route and no requested document ID; denial still returns `404 RESOURCE_NOT_FOUND`. Signed URL issuance and not-ready denial are durably audited; audit storage failure returns `503 AUDIT_UNAVAILABLE` and never returns the URL. Document-detail and download-url GETs now share a Redis-backed limit of 60 requests/minute per IP with IDs normalized to one key, limiting audit-flood attempts.
- Implemented: document lists resolve type through the versioned template while keeping storage keys private; official document number is returned only for `ready` items. Student dashboard now renders live queued/processing/ready/failed/missing states and uses the audited short-lived download endpoint for ready PDFs. Download URLs are capped at 300 seconds, forced to attachment/PDF, checked for HTTPS in production, and opened without a referrer. Cross-scope/missing lookups are audited with a constant route and no requested ID but still return `404`; audit failure returns `503` and never releases a signed URL. Document-detail/download GETs share a Redis-backed limit of 60 requests/minute per IP with ObjectIds normalized.
- Validation: isolated Mongo replica-set tests cover own-vs-foreign listing/reads, matching 404 for absent/foreign documents, no-ID denial metadata, status/type/number projection without object keys, signed URL expiry/content disposition/audit, audit-storage fail-closed, and no URL returned on audit failure. Rate-limit tests vary valid Mongo ObjectIds and confirm the 61st lookup receives `429`; PDF-generation tests cover actor/IP quotas, changing IPs/idempotency keys, missing actor, and Redis fail-closed. Web tests cover newest processing state alongside an older downloadable PDF, failed/missing states, unique/missing/ambiguous template selection, exact evaluation-source matching, and stable idempotency keys. Production-built browser smoke with isolated mock APIs verifies scoped source IDs and idempotency header on the request, queued-to-ready status, unavailable-template gating, and zero console errors/warnings. Full `pnpm verify` exited 0 after latest increment: API 214, Worker 34, Web 49, package suites, OpenAPI checks, lint/typecheck, and production builds. Official Certificate/Transcript assets/signatures and PDF visual UAT remain release gaps; browser smoke issued no real PDF and no production services were used.

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
- Implemented: runtime validates `termId`, `schoolId`, and `programId`; combines them with the actor's assignment scope rather than replacing it; resolves terms through cycles; aggregates status, delivery, assigned-student, and ready-document totals in Mongo. Paired-role, cross-scope-filter, term, legacy/canonical Student reference, and count reconciliation cases pass against an isolated replica set. `GET /students` now provides paginated Student records and optional scoped directory summaries/facets. The UI filters/searches server-side, protects against stale responses, and shows a load error; Excel export reads all matching pages only on demand. Regression covers summary reconciliation, cycle-derived organization/evaluator search, status boundaries, and the server-filtered browser path.
- Latest UI optimization: school/program/course/organization/evaluator lookups now use one-pass maps; assignments and placements use canonical/business Student-reference indexes. Relation results preserve source order and deduplicate records, retaining existing cycle ambiguity behavior. Unit regressions cover source ordering, canonical/business references, repeated keys, and unrelated records. Evaluation-cycle list itself is server-paginated at 25 rows; Program labels use the visible cycle page's IDs, and create-form choices are queried by selected School.
- API also accepts `academicYear` and `semester` (including Buddhist/Gregorian equivalents) and exact cycle status filters `pending`, `inProgress`, `expired`, and `assignment_ambiguous` with legacy aliases retained. Summary/facets are actor-scoped and computed from canonical Student/Assignment state. Joined Course and selected-cycle Organization/Evaluator search references are intersected with the authorized result filter. OpenAPI and generated client match runtime.
- Scale remains open: The bilingual 21-column Student directory XLSX uses the server-side REP-002 job and reuses the actor-scoped `MembersService` projection inside the same explicit MongoDB snapshot transaction as export metadata/snapshot writes. Replica-set regression proves a coherent point-in-time view under concurrent Placement/Organization updates. No agreed production load/p95 target or large-dataset query profile has been recorded; this does not establish production-scale readiness.
- Validation: a browser failure injection reproduced `/students` returning `503` while the dashboard rendered `0` and an empty state. The dashboard now shows a primary-list error and hides the empty directory; failed supporting lists show a warning. Pagination tests cover all-page completeness/order, metadata drift, duplicate IDs, and empty results. Production-built browser smoke with 1,001 synthetic Students verified three API pages, the `1001 คน` total, and search of the final Student; console had zero errors/warnings. Cycle-management E2E reproduced an extra Program-list request whenever School changed (1 request); UI now filters the already-loaded scoped records and regression passes 1/1. Latest full `pnpm verify` counts and status are in `AI_HANDOFF.md`.

### REP-002 — Audited export jobs

- Status: `In Progress`
- Priority: `P1`
- Depends on: `REP-001`, `FND-004`
- Requirements: `FR-REP-002`
- Acceptance:
  - export captures filters, requester, scope, format, and snapshot time;
  - generated asynchronously with private expiring download;
  - audit records request and download;
  - sensitive columns require explicit permission.
- Implemented: Existing assignment CSV remains compatible. `POST /reports/exports` also accepts a strict `studentDirectory` XLSX request with locale and directory filters, snapshots the existing actor-scoped Student projection (including placement/evaluator/category score fields), and caps exports at 5,000 rows. Requests are actor-bound/idempotent/audited; status and download endpoints re-check requester/current scope; private signed downloads expire within 300 seconds and export records/snapshots within 24 hours. Worker creates the bilingual 21-column XLSX, checksum-addressed private object, preserves column widths and workbook names, and keeps text cells out of formula execution. Web submits filters only, polls the async job, and downloads by signed URL.
- Evidence: API isolated-replica-set tests cover directory projection snapshot, scope fields, idempotency replay, row-limit rejection, and existing CSV isolation; Worker tests cover XLSX contents, formula treatment, stable bytes, S3 metadata/state transition, and CSV regressions; Playwright verifies the browser sends no Student rows and completes the async signed-download flow. Full `pnpm verify` exited 0: API 385 passed/4 skipped, Worker 46 passed/1 skipped, Web 72 passed, shared-types 15, config 44, email-security 3, design-tokens 1, validation 1, API-client 2, infra/contracts 21, E2E foundation 1, Playwright 18; format/OpenAPI/lint/typecheck/tests and production builds passed.
- Snapshot consistency (2026-09-29): source projection reads and durable snapshot writes share an explicit MongoDB snapshot transaction. Session-backed list and join queries run sequentially; concurrent-write regression verifies one coherent point-in-time view. Full no-skip `pnpm verify` passes with isolated Redis and MongoDB replica sets: API 390/390, Worker 47/47, Web 72/72, contracts 21/21, Playwright 18/18, plus format/OpenAPI/lint/typecheck/build gates.
- Remaining: preserve In Progress until REP-001/FND-004 acceptance is complete, private object-storage recovery/provider behavior is validated, and production-scale query/load targets are documented. No live DB migration, S3 provider write, real email, deployment, commit, or push was used.

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

| Decision                                     | Blocks                                 | Current state                                                                                                                                                                 |
| -------------------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MFU OIDC configuration and claims            | `AUTH-003`                             | account-linking policy decided/implemented; real issuer, client, claims, logout, and UAT remain `TBD`                                                                         |
| Invitation lifetime/verification/reminders   | `AUTH-005`, `MAIL-002`                 | deadline-bound; reminder reuses invitation and never extends time                                                                                                             |
| Score scale, required questions, aggregation | `EVL-005`, reporting                   | category means decided; scale/required rules come from published snapshot                                                                                                     |
| Reopen authority and time window             | `EVL-006`                              | explicitly out of MVP                                                                                                                                                         |
| Result visibility policy                     | student dashboard/document eligibility | final result visible after atomic submit                                                                                                                                      |
| Official PDF layouts, fonts, publisher       | `DOC-103`                              | Certificate/Transcript only; use approved layout/assets                                                                                                                       |
| Production MongoDB/email/storage/monitoring  | `OPS-002`                              | `TBD`                                                                                                                                                                         |
| Production container registry/image digests  | `OPS-002`                              | publisher/signature gate is implemented in-repo; GH Environment protection, GHCR access, successful hosted release, and approved API/Worker/Web digest refs remain unverified |
| Retention, RPO, RTO                          | `OPS-001`                              | `TBD`                                                                                                                                                                         |
| Migration collections and thresholds         | `MIG-001`                              | `TBD`                                                                                                                                                                         |

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

## 13. Verified increments through 2026-09-27

- Removed the obsolete evaluator PIN credential path from the student directory: PIN is no longer read into enriched rows, searched, displayed, copied, or exported. Invitation credentials stay in the correspondence/invitation flow. Thai and English workbook exports now pass through an explicit allowlist; unit regression injects legacy PIN/hash/token/URL fields and verifies none are exported.
- Browser regression stubs an API response containing those legacy secrets and verifies the directory neither finds a student by PIN nor renders PIN/hash/token in the student detail. Playwright is capped at one worker because the existing evaluator reload flow timed out under four concurrent browser sessions; the complete four-test suite passes serially.
- Full `pnpm verify` exited 0: API 266 across 40 files, Worker 34, Web 55 across 15 files, shared-types 15, config 20, email-security 3, design-token 1, validation 1, API-client 2, E2E foundation 1, Playwright 4; formatting, generated OpenAPI check/lint, workspace lint/typecheck/tests, and API/Worker/Nuxt production builds passed. Non-fatal Nuxt plugin timing, Node `DEP0155`, and Playwright `NO_COLOR` notices remain.
- Production release remains blocked by real MFU OIDC/UAT, approved secrets/infrastructure, migration rehearsal/reconciliation, official PDF assets and visual UAT, supported Redis/provider recovery, backup/restore, monitoring/ownership, load/accessibility gates, and sign-off. No application DB, real SMTP/object storage, deployment, commit, or push was used.
- Multi-role authorization regression found inactive-role leakage and invalid tenant-wide scopes in student import, competency reads, audit visibility, organization/evaluator directories, academic writes, user management, and export audit metadata. Scope resolution now requires active role-specific grants; legacy multi-role actors without per-role scope fail closed. Targeted regression suites pass.
- `pnpm verify` now exits 0 end-to-end: API 282 tests/42 files, Worker 34/11, Web 55/15, shared-types 15/3, config 21/3, email-security 3/1, design-token 1, validation 1, API-client 2, infra 1, E2E foundation 1, Playwright 4; format, OpenAPI check/lint, workspace lint/typecheck, and API/Worker/Nuxt production builds pass. `pnpm audit --prod` reports no known vulnerabilities.
- `.env.development` resolves to local MongoDB; `.env.production` has a remote MongoDB URI configured. Values were not printed or used. Production URI connectivity, identity/provider credentials, and infrastructure remain unverified by design.
- The full code verification is not Production release approval. Real MFU OIDC/UAT, migration rehearsal, approved Certificate/Transcript assets and visual UAT, supported Redis/provider recovery, backup/restore, monitoring/on-call ownership, load/accessibility gates, and release-owner sign-off remain blocked. No application DB, SMTP/S3 provider, deployment, commit, or push was used.

- `GET /students` now applies `academicTermId`; evaluation status requires an explicit `cycleId` and is derived from scoped assignments for that cycle, restricted to placements in that term. Without cycle context, the stale profile projection is omitted. The directory UI offers cycle selection and uses that cycle's placement for historical company/course details.
- Regression evidence: the isolated MongoDB test reproduced cross-term student results and a stale `submitted` projection overriding a `pending` assignment. Tests now cover term filtering, all three evaluation states, missing cycle rejection, out-of-scope cycle concealment, and suppressing unscoped status/evaluator fallback.
- Report evidence: an isolated MongoDB test reproduced a prior-term ready PDF being counted in the current term. Overview now matches ready documents to immutable placement snapshot term/school/program; the historical PDF is excluded from term-filtered totals.
- `pnpm verify` exited 0 after these changes: format, generated OpenAPI check/lint, workspace lint/typecheck/tests, API 251 tests, Worker 34, Web 51, foundation 1, Playwright E2E 2, and production builds passed.
- Limitation: legacy generated documents without `sourceSnapshot.placement` cannot be attributed safely to a term and are omitted from term-filtered PDF totals until an approved migration can establish that reference. No live DB, SMTP, object storage, deployment, commit, or push was used.

## 14. Latest verified increment — 2026-09-29

- Reproduced an OIDC callback credential leak in API access logs: `pino-http` serialized the full callback URL, including `code` and `state`. Centralized the redaction policy and now censor both `req.url` and the complete parsed `req.query`; the regression asserts both fields are censored and neither sentinel value appears in the emitted log. The final focused regression passes 1/1.
- Confirmed the Student `organizations.read` decision is already enforced end-to-end: organization rows come only from own placements; evaluator rows require the Student's own assignment and the exact placement organization; supplied search/organization filters only narrow results. Isolated Mongo role matrix passes 51/51.
- Added a runtime `AccessGuard` matrix for every registered non-public route × all six roles. Every role must receive `401` without a session; allowed and denied role/route pairs must match the explicit permission policy (guard allow / `403` deny). Contract suite passes 6/6. It does not claim record-level scope or full business-state coverage.
- `pnpm verify` exited 0: format, OpenAPI generation check/lint, workspace lint/typecheck, contracts 19/19, API 360 tests/54 files, Worker 40/13, Web 69/20, E2E foundation, Playwright 12/12, and API/Worker/Web production builds. The exact whole-query redaction was then rechecked by the focused HTTP log regression. Existing Nuxt plugin timing, Node `DEP0155`, and Playwright `NO_COLOR` notices are non-fatal.
- This is Engineering-ready verification, not Production release approval. Real MFU OIDC configuration/claims/UAT, provider/infrastructure recovery, migration rehearsal, approved PDF assets and visual UAT, backup/restore, monitoring/on-call, accessibility/load gates, and named owner sign-off remain unverified. No live service/data, real email/storage, deployment, commit, or push was used.
- Latest REP-001 Program-reference fix: backend `GET /academic/programs` accepts a validated `programIds` filter ANDed with authorized actor scope; OpenAPI/client match. Cycle UI fetches references needed for visible cycles only and queries create choices by School. API controller/Mongo scope tests and cycle-management E2E pass; whole-workspace `pnpm verify` exited 0 (contracts 21/21, API 370/370, Worker 43/43, Web 69/69, Playwright 15/15, all production builds).
- Owner confirmed Student Organization/Evaluator visibility stays placement-bound. Existing runtime and tests implement this: Organizations from own Placements; Evaluators from own assignments only when Organization matches that exact Placement. Search and organization filters narrow only. Focused regression `pnpm --filter @internship/api test -- test/student-crud.mongo.integration.test.ts -t "scopes Organization and Evaluator directories to visible Placements"` passes 1/1 (50 other tests skipped by name filter). No source change was needed for this policy decision.
- Latest verification used isolated ephemeral MongoDB replica sets and temporary loopback Redis 8.0.5; Redis temp directory removed, shared Windows Redis listener untouched. Docker Engine remains unavailable. Live Production still blocked by real MFU OIDC/UAT, production secrets/providers, migration rehearsal, approved PDF assets/UAT, Docker/provider recovery, backup/restore, monitoring/on-call, load/accessibility gates, and release-owner approval. No live data/provider, real email/storage, deployment, commit, or push.
- Added a real Nodemailer SMTP-wire regression using a loopback-only capture server; it verifies envelope sender/recipient and captured headers/body without external delivery. The S3 SDK loopback test verifies signed path-style `PutObject` does not request a public ACL (`x-amz-acl`); it does not prove actual bucket policy blocks anonymous access. Focused SMTP/S3 tests pass 3/3. Full `pnpm verify` with isolated Redis 8.0.5 exits 0 with no Redis-gated skips: contracts 20/20, API 365/365, Worker 43/43, Web 69/69, Playwright 12/12, formatting/OpenAPI/lint/typecheck and Production builds. An initial Redis startup probe inherited WSL's workspace directory and loaded its ignored `dump.rdb`; no test/cache commands were sent to that instance, it was stopped with `shutdown nosave`, and file mtime remained 2026-09-23 10:02 UTC. All test runs used a separate empty temp directory, loopback binding, and disabled RDB/AOF; that instance was stopped and its temp directory removed. Docker Engine is unavailable, so actual Mailpit/MinIO service integration remains unverified. No Production service/data, real email/storage, deployment, commit, or push was used.

## Latest implementation increment — 2026-09-29 (directory scoring)

- Student directory relation includes only the active final's Hard Skill and Soft Skill category summaries for each scoped submitted assignment; raw answers and credential fields remain excluded. Student Organization/Evaluator visibility remains limited to own Placements and own assignments matched to the exact placement Organization.
- Directory score display and Thai/English XLSX now show category means separately, with scale and answered count; no cross-category total, grade, or assumed `/5.0`. Empty category renders `-`; export retains 21 columns.
- OpenAPI `StudentDirectoryAssignment.categoryScores` and generated client match runtime.
- Validation: API 380 passed/4 skipped; Web 72 passed; focused placement-scope and active-final-score Mongo regressions pass; API/Web typechecks, scoped lint/format, and OpenAPI check pass. Full `pnpm verify` not rerun after this increment.
- Superseded by the REP-002 implementation in Section 9: directory export is now an audited, actor-scoped server job using a MongoDB snapshot transaction and Worker-generated bilingual XLSX; the browser submits filters and downloads a private signed result rather than aggregating all pages. Production provider recovery, production-scale targets, and remaining REP-001/FND-004 acceptance stay open.
- Historical regression evidence: the browser fixture once omitted placement/evaluator/category-score relations. The scoped server projection and XLSX worker now carry those fields; the regression flow verifies Hard `4.3`, Soft `3.5`, Thai workbook generation, and that the browser sends filters rather than Student rows. See the latest REP-002 validation above for current test results.
