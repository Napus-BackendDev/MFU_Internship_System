# Authorization and Permission Model

## 1. Purpose

This document is the canonical authorization matrix for Internship Transcript System V2. It converts product roles into backend-enforceable actions and resource scopes.

Frontend route middleware may hide unavailable actions, but only NestJS policy checks authorize access.

## 2. Core policy

1. Default deny.
2. Every authenticated operation requires both an action and an allowed resource scope.
3. Role names never come from client request data.
4. System Administrator is powerful but not an automatic bypass for immutable evaluation history.
5. Student and External Evaluator access is ownership/assignment based.
6. Coordinator scope is limited to assigned School/Program boundaries.
7. Auditor is read-only, including exports explicitly designed for audit.
8. Sensitive cross-owner lookup normally returns `404` to conceal existence; administrative endpoints may return `403` when the resource is already known within an authorized list.
9. Every denial is safe to log with request ID, actor ID, action, target type, and scope mismatch; never log invitation/access tokens.
10. All significant mutations create audit events.

## 3. Roles

| Role key          | Display name               | Primary scope                                                   |
| ----------------- | -------------------------- | --------------------------------------------------------------- |
| `systemAdmin`     | System Administrator       | Tenant/system-wide administration                               |
| `internshipStaff` | Internship Staff           | Operational data, normally tenant-wide or assigned School scope |
| `coordinator`     | Academic Coordinator       | Assigned Schools and Programs                                   |
| `student`         | Student                    | Own Student identity and eligible own resources                 |
| `evaluator`       | External Evaluator/Adviser | Active invitation/assignment only                               |
| `auditor`         | Auditor / Read-only        | Approved tenant/School/Program audit scope                      |

A user may have multiple active role assignments. For a permission-protected route, at least one role must independently satisfy the route's complete required/any-permission policy; request scope includes only those permission-granting roles and preserves each School/Program pairing. Authenticated-only routes retain the actor's complete active-role context. Explicit deny/immutability and tenant/resource boundaries still apply.

## 4. Resource scopes

| Scope           | Meaning                                             | Required evidence                                |
| --------------- | --------------------------------------------------- | ------------------------------------------------ |
| `tenant`        | All records in current system tenant                | active tenant-level role assignment              |
| `school`        | Records belonging to assigned School IDs            | role assignment contains School IDs              |
| `program`       | Records belonging to assigned Program IDs           | role assignment contains Program IDs             |
| `studentOwn`    | Resource belongs to authenticated Student           | user-to-student identity mapping                 |
| `assignmentOwn` | Evaluation belongs to evaluator's active assignment | evaluator session/invitation bound to assignment |
| `createdBy`     | User created owned Draft artifact                   | immutable creator ID and active ownership policy |
| `auditApproved` | Read/export scope explicitly approved for auditor   | active auditor role assignment and filters       |

Scope must be applied in the database query or repository filter. Fetch-then-check is allowed only when query-level enforcement is impossible and resource existence cannot leak.

## 5. Permission catalog

### System and identity

| Permission             | Meaning                                             |
| ---------------------- | --------------------------------------------------- |
| `system.config.manage` | Manage tenant/system configuration and integrations |
| `users.read`           | Read users within scope                             |
| `users.manage`         | Create, update, archive users and role assignments  |
| `sessions.read`        | Read active sessions within scope                   |
| `sessions.revoke`      | Revoke an active session                            |
| `audit.read`           | Read audit events within approved scope             |
| `audit.export`         | Export audit evidence within approved scope         |

### Academic and internship data

| Permission             | Meaning                                                                                                                                                                               |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `academic.read`        | Read School, Program, Course, Term                                                                                                                                                    |
| `academic.manage`      | Create, update, archive academic master data                                                                                                                                          |
| `students.read`        | Read Student records within scope                                                                                                                                                     |
| `students.manage`      | Create, update, archive Student records                                                                                                                                               |
| `students.import`      | Preview and commit bulk Student import                                                                                                                                                |
| `organizations.read`   | Read Organizations and Evaluators within scope; Students see only Organizations linked to own Placements and Evaluators assigned to own assessments for that Placement's Organization |
| `organizations.manage` | Create, update, archive Organizations/Evaluators                                                                                                                                      |
| `placements.read`      | Read Placements and Evaluator Assignments                                                                                                                                             |
| `placements.manage`    | Create, update, archive Placements/Assignments                                                                                                                                        |

### Competency and evaluation

| Permission             | Meaning                                                          |
| ---------------------- | ---------------------------------------------------------------- |
| `competencies.read`    | Read competency sets/versions available to scope                 |
| `competencies.manage`  | Create/edit/archive Draft competency versions                    |
| `competencies.publish` | Publish a validated competency version                           |
| `cycles.read`          | Read evaluation cycles within scope                              |
| `cycles.manage`        | Create, preview, activate, close evaluation cycles               |
| `evaluations.read`     | Read evaluation assignment/final results within visibility scope |
| `evaluations.draft`    | Save own assigned evaluation Draft                               |
| `evaluations.submit`   | Submit own assigned evaluation once                              |
| `evaluations.reopen`   | Reserved for a future release; disabled in the Production MVP    |

### Correspondence

| Permission               | Meaning                                                                                                                                                          |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `emailTemplates.read`    | Read approved email templates/versions                                                                                                                           |
| `emailTemplates.manage`  | Create/edit/archive Draft email template versions                                                                                                                |
| `emailTemplates.publish` | Publish validated email template version                                                                                                                         |
| `campaigns.read`         | Read campaign status in scope; row-level delivery details are limited to System Admin, scoped Internship Staff, and Auditor; Coordinator receives summaries only |
| `campaigns.send`         | Preview/create invitation or reminder campaign                                                                                                                   |
| `deliveries.retry`       | Retry eligible failed delivery without bypassing idempotency                                                                                                     |

### Documents and reporting

| Permission                  | Meaning                                                                                              |
| --------------------------- | ---------------------------------------------------------------------------------------------------- |
| `documentTemplates.read`    | Read active shared templates; non-managers receive Published metadata/version summaries only         |
| `documentTemplates.manage`  | Create/edit Draft versions of tenant-wide shared templates; System Admin or tenant-scoped Staff only |
| `documentTemplates.publish` | Publish validated shared-template version; System Admin or tenant-scoped Staff only                  |
| `documents.generateOwn`     | Request generated document for own Student record                                                    |
| `documents.generateScoped`  | Request generated document for authorized Student scope                                              |
| `documents.readOwn`         | Read/download own generated document                                                                 |
| `documents.readScoped`      | Read/download generated documents within operational scope                                           |
| `reports.read`              | Read dashboards/reports within scope                                                                 |
| `exports.create`            | Request scoped asynchronous export                                                                   |
| `exports.download`          | Download own or explicitly authorized export                                                         |

## 6. Role-to-permission matrix

Legend: `T` tenant, `S/P` assigned School/Program, `Own` own Student, `Assign` own evaluator assignment, `A` approved audit scope, `—` denied.

| Permission                  | systemAdmin             | internshipStaff   | coordinator               | student                                   | evaluator                                                | auditor                  |
| --------------------------- | ----------------------- | ----------------- | ------------------------- | ----------------------------------------- | -------------------------------------------------------- | ------------------------ |
| `system.config.manage`      | T                       | —                 | —                         | —                                         | —                                                        | —                        |
| `users.read`                | T                       | S/P               | —                         | Own                                       | —                                                        | A                        |
| `users.manage`              | T                       | limited S/P       | —                         | —                                         | —                                                        | —                        |
| `sessions.read`             | T                       | —                 | —                         | Own                                       | Own                                                      | A                        |
| `sessions.revoke`           | T                       | —                 | —                         | Own                                       | Own                                                      | —                        |
| `audit.read`                | T                       | operational S/P   | S/P                       | own security events only                  | —                                                        | A                        |
| `audit.export`              | T                       | —                 | —                         | —                                         | —                                                        | A                        |
| `academic.read`             | T                       | T/S/P             | S/P                       | linked records                            | linked records                                           | A                        |
| `academic.manage`           | T                       | T/S/P             | —                         | —                                         | —                                                        | —                        |
| `students.read`             | T                       | T/S/P             | S/P                       | Own                                       | assigned Student summary                                 | A                        |
| `students.manage`           | T                       | T/S/P             | —                         | correction request only                   | —                                                        | —                        |
| `students.import`           | T                       | T/S/P             | —                         | —                                         | —                                                        | —                        |
| `organizations.read`        | T                       | T/S/P             | S/P                       | Own placement only                        | —                                                        | A                        |
| `organizations.manage`      | T                       | T/S/P             | —                         | —                                         | —                                                        | —                        |
| `placements.read`           | T                       | T/S/P             | S/P                       | Own                                       | Assign                                                   | A                        |
| `placements.manage`         | T                       | T/S/P             | —                         | —                                         | —                                                        | —                        |
| `competencies.read`         | T                       | T/S/P             | S/P                       | published own Program                     | — (reads own assignment snapshot via `evaluations.read`) | A                        |
| `competencies.manage`       | T                       | T/S/P             | —                         | —                                         | —                                                        | —                        |
| `competencies.publish`      | T                       | T/S/P             | —                         | —                                         | —                                                        | —                        |
| `cycles.read`               | T                       | T/S/P             | S/P                       | eligible own cycle                        | Assign                                                   | A                        |
| `cycles.manage`             | T                       | T/S/P             | —                         | —                                         | —                                                        | —                        |
| `evaluations.read`          | T with visibility rules | T/S/P             | S/P after visibility gate | Own after visibility gate                 | Assign before/after submit as policy allows              | A after visibility gate  |
| `evaluations.draft`         | —                       | —                 | —                         | only if self-evaluation is later approved | Assign                                                   | —                        |
| `evaluations.submit`        | —                       | —                 | —                         | only if self-evaluation is later approved | Assign                                                   | —                        |
| `evaluations.reopen`        | —                       | —                 | —                         | —                                         | —                                                        | —                        |
| `emailTemplates.read`       | T                       | T/S/P             | —                         | —                                         | —                                                        | A                        |
| `emailTemplates.manage`     | T                       | T/S/P             | —                         | —                                         | —                                                        | —                        |
| `emailTemplates.publish`    | T                       | T/S/P             | —                         | —                                         | —                                                        | —                        |
| `campaigns.read`            | T                       | T/S/P             | S/P summary only          | —                                         | own invitation status only                               | A (scoped delivery rows) |
| `campaigns.send`            | T                       | T/S/P             | —                         | —                                         | —                                                        | —                        |
| `deliveries.retry`          | T                       | T/S/P             | —                         | —                                         | —                                                        | —                        |
| `documentTemplates.read`    | T                       | Published summary | Published summary         | Published summary                         | —                                                        | Published summary        |
| `documentTemplates.manage`  | T                       | T only            | —                         | —                                         | —                                                        | —                        |
| `documentTemplates.publish` | T                       | T only            | —                         | —                                         | —                                                        | —                        |
| `documents.generateOwn`     | —                       | —                 | —                         | Own                                       | —                                                        | —                        |
| `documents.generateScoped`  | T                       | T/S/P             | S/P if policy permits     | —                                         | —                                                        | —                        |
| `documents.readOwn`         | —                       | —                 | —                         | Own                                       | —                                                        | —                        |
| `documents.readScoped`      | T                       | T/S/P             | S/P after visibility gate | —                                         | —                                                        | A                        |
| `reports.read`              | T                       | T/S/P             | S/P                       | own dashboard                             | —                                                        | A                        |
| `exports.create`            | T                       | T/S/P             | S/P                       | —                                         | —                                                        | A                        |
| `exports.download`          | own/authorized          | own/authorized    | own/authorized            | —                                         | —                                                        | own/authorized           |

`limited S/P` user management means Staff may manage operational accounts explicitly delegated by policy, never create `systemAdmin` or expand scope beyond their own assignment.

OIDC account linking is stricter than the general `users.manage` permission: only System Admin may link a pre-created account, and only to the exact subject under the issuer discovered from the configured provider. Email matching is prohibited. A reason, actor-scoped idempotency key, and transaction-coupled audit record are required.

Audit read always includes the authenticated actor's own log records. Staff and Auditors may additionally read events tagged with persisted `resourceScopes` matching one of their active role assignments that grants `audit.read`; School and Program constraints within an assignment are ANDed, while separate assignments remain separate OR branches. System Administrators may query across actors. Non-admin `actorId` filters are ignored. Legacy and generic mutation logs without trustworthy `resourceScopes` remain visible only to their actor, and tenant-scoped readers see only explicitly scoped events. No scope is inferred from request query or body data.

## 7. Resource rules by domain

### 7.1 Student

- `student` identity maps to exactly one active Student record unless an approved exception exists.
- Student may read own profile, placement summary, eligible results, and own generated documents.
- Student may read only Organizations linked to their own Placements and Evaluators assigned to their own assessments whose Organization matches that exact Placement; search and organization filters only narrow this result and never broaden it.
- Student cannot directly edit authoritative academic fields; use a correction-request workflow if implemented.
- Staff/Coordinator query filters must include permitted School/Program scope.
- Cross-student direct lookup by Student/evaluator returns `404` and records a security event.

### 7.2 Evaluator assignment and invitation

- Invitation token is random/signed, stored hashed where applicable, expires, can be revoked, and binds to one assignment.
- Token exchange creates an evaluator session containing assignment ID and minimum required claims.
- Evaluator may see only the assigned Student summary required to assess.
- Evaluator cannot enumerate Student, placement, cycle, or evaluation identifiers.
- Assignment close, invitation revoke, expiry, or final submit removes Draft/submit ability.
- Reopen is unavailable in the Production MVP; legacy `reopened` records do not grant invitation exchange, PIN verification, Draft, or submit access.

### 7.3 Evaluation

- Draft belongs to one assignment and uses the assignment's immutable question snapshot.
- Staff/System Admin may inspect workflow state, but reading raw answers before visibility gates requires an explicit operational/legal basis.
- Submitted answer content is immutable.
- Reopen is disabled for the MVP. No role has `evaluations.reopen`; submitted content remains locked and immutable.
- If Student result visibility is off, own evaluation endpoint must conceal result content while still allowing safe progress/status if product policy permits.

### 7.4 Templates

- Draft competency/email templates may be modified by authorized Staff in scope.
- Document templates and registered assets are shared tenant-wide and have no School/Program scope fields. Only System Admin and tenant-scoped Internship Staff may list the asset library, create/edit Draft versions, or publish. School/Program-scoped Staff cannot manage these shared artifacts.
- Other roles with `documentTemplates.read` see active templates with Published versions and Published summaries only. Template summaries whitelist display names, description, background type, and opacity; Draft content, canonical JSON, arbitrary metadata, placeholders, and private asset keys are not returned. Published version IDs for archived templates are concealed as `404`.
- Introducing scope-specific document templates/assets requires explicit scope fields, migration, and authorization tests; do not infer scope from an actor's combined role scopes.
- Published versions are immutable even for System Administrator.
- Publishing is a separate permission from editing.
- Retired versions remain readable for records that reference them but are unavailable for new cycles/jobs.

### 7.5 Documents and exports

- Generated files remain private.
- Download endpoint verifies access every time before issuing a short-lived signed URL.
- Missing and out-of-scope document identifiers return the same `404`; denial is durably audited without storing the requested identifier. A signed URL is returned only after its issuance audit persists.
- Document-detail and download-url lookups share a Redis-backed per-IP rate limit so changing document IDs cannot bypass the limit or create unbounded denial-audit writes.
- Possession of database/file ID alone grants no access.
- Export ownership does not bypass requested-data permission; scope is fixed at job creation.
- Audit export requires `audit.export`, not only `exports.create`.

## 8. Endpoint policy map

The OpenAPI file carries matching `x-permissions` metadata. Minimum mapping:

| Endpoint family                          | Read permission                                                       | Mutation permission                                        |
| ---------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------- |
| `/academic/*`                            | `academic.read`                                                       | `academic.manage`                                          |
| `/students`                              | `students.read`                                                       | `students.manage` / `students.import`                      |
| `/organizations`, `/evaluators`          | `organizations.read`                                                  | `organizations.manage`                                     |
| `/placements`, `/evaluation-assignments` | `placements.read`                                                     | `placements.manage` / `cycles.manage`                      |
| `/competency-sets`                       | `competencies.read`                                                   | `competencies.manage` / `competencies.publish`             |
| `/evaluation-cycles`                     | `cycles.read`                                                         | `cycles.manage`                                            |
| `/evaluations`                           | `evaluations.read`                                                    | `evaluations.draft`, `evaluations.submit`; reopen disabled |
| `/email-templates`                       | `emailTemplates.read`                                                 | `emailTemplates.manage`, `emailTemplates.publish`          |
| `/campaigns`                             | `campaigns.read`                                                      | `campaigns.send`                                           |
| `/deliveries`                            | `campaigns.read` (Admin/Staff/Auditor rows; Coordinator summary only) | `deliveries.retry` (Admin/Staff, assignment scope)         |
| `/system-settings/smtp*`                 | `system.config.manage`                                                | `system.config.manage`                                     |
| `/document-templates`                    | `documentTemplates.read`                                              | `documentTemplates.manage`, `documentTemplates.publish`    |
| `/generated-documents`                   | own/scoped document permission                                        | own/scoped generate permission                             |
| `/reports`                               | `reports.read`                                                        | —                                                          |
| `/exports`                               | job read through ownership                                            | `exports.create`, `exports.download`                       |
| `/audit-logs`                            | `audit.read`                                                          | `audit.export` for export                                  |

## 9. HTTP denial behavior

| Situation                                | Response                       | Notes                                                   |
| ---------------------------------------- | ------------------------------ | ------------------------------------------------------- |
| No valid session                         | `401 AUTHENTICATION_REQUIRED`  | no sensitive detail                                     |
| Expired/revoked invitation               | `401 INVITATION_INVALID`       | same external message for invalid variants where useful |
| Authenticated but action not granted     | `403 PERMISSION_DENIED`        | administrative/list context                             |
| Cross-owner sensitive identifier         | `404 RESOURCE_NOT_FOUND`       | conceal existence                                       |
| State forbids otherwise permitted action | `409 INVALID_STATE_TRANSITION` | safe current state may be returned                      |
| Optimistic version mismatch              | `409 VERSION_CONFLICT`         | client must reload                                      |
| Validation failure                       | `422 VALIDATION_ERROR`         | field-safe details only                                 |

## 10. Required authorization tests

For every protected operation, implement:

1. allowed role and matching scope succeeds;
2. same role outside scope fails;
3. unrelated role fails;
4. no session fails;
5. archived/inactive role assignment fails;
6. direct object ID cannot bypass list scope;
7. tenant boundary cannot be crossed;
8. denial does not leak sensitive body fields;
9. significant mutation writes audit event;
10. frontend-hidden action remains denied when API called directly.

Critical matrix scenarios are defined as `AC-AUTH-*` in `docs/product/ACCEPTANCE_CRITERIA.md`.

## 11. Decisions still TBD

- Whether `systemAdmin` may view individual answers by default or only through audited break-glass access.
- Exact Staff authority to manage non-administrative user accounts.
- Coordinator visibility timing for individual results.
- Whether Student self-evaluation exists in release 1.
- Reopen authority and time window.
- Auditor access to PII and raw comments.

Until approved, apply the least-privilege option and keep the behavior configurable/tested.
