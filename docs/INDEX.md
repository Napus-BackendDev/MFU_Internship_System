# Documentation Index

## Purpose

This page routes contributors and AI agents to the smallest authoritative context needed for each task. Do not load every document by default.

## Current state

- Phase: Release 1 implementation baseline; Production integration/release gates pending
- Applications: Nuxt web, NestJS API, and BullMQ worker implemented
- Canonical API: `docs/api/openapi.yaml`
- Next tasks: finish `FND-005`/`FND-007` and resolve owner blockers in `AI_HANDOFF.md`
- Production integrations: several values remain `TBD`

## Start here

| Need                       | Read first                               | Then read                                              |
| -------------------------- | ---------------------------------------- | ------------------------------------------------------ |
| Any implementation         | `AGENTS.md`, `AI_HANDOFF.md`, `TASKS.md` | Task-linked documents                                  |
| Product scope              | `Goal.md`                                | `Tor.md`, acceptance criteria                          |
| Architecture               | `System.md`                              | `Techstack.md`, relevant ADR when created              |
| API endpoint               | `docs/api/openapi.yaml`                  | permissions, database, acceptance criteria             |
| Authentication/RBAC        | `docs/architecture/PERMISSIONS.md`       | OpenAPI security, acceptance criteria                  |
| MongoDB/schema             | `database.md`                            | OpenAPI schema and migration tasks                     |
| Nuxt screen/component      | `docs/design/DESIGN_SYSTEM.md`           | `desgin.md`, OpenAPI, permissions, acceptance criteria |
| Evaluation workflow        | `System.md` section 7                    | database, permissions, acceptance criteria             |
| Email/queue                | `Tor.md` correspondence requirements     | database, acceptance criteria, OpenAPI                 |
| PDF/document               | `desgin.md`, `database.md`               | OpenAPI and acceptance criteria                        |
| Migration                  | `database.md` section 15                 | TOR AT-06 and migration tasks                          |
| Production deploy/recovery | `docs/operations/PRODUCTION_RUNBOOK.md`  | `AI_HANDOFF.md`, acceptance release gates              |

## Canonical documents

### Operating context

- [`../AGENTS.md`](../AGENTS.md): mandatory rules and completion gates
- [`../README.md`](../README.md): project status, local quick start, verification, and Production handoff
- [`../AI_HANDOFF.md`](../AI_HANDOFF.md): current state, decisions, blockers, and next action
- [`../TASKS.md`](../TASKS.md): dependency-ordered implementation backlog

### Product

- [`../Goal.md`](../Goal.md): vision, outcomes, KPIs, MoSCoW, milestones
- [`../Tor.md`](../Tor.md): functional/non-functional requirements and delivery scope
- [`product/ACCEPTANCE_CRITERIA.md`](product/ACCEPTANCE_CRITERIA.md): Given-When-Then scenarios and release gates

### Architecture

- [`../System.md`](../System.md): As-Is evidence, target architecture, domains, workflows
- [`../Techstack.md`](../Techstack.md): Nuxt/NestJS/MongoDB stack and delivery baseline
- [`../database.md`](../database.md): collections, indexes, state machines, migration, backup
- [`architecture/PERMISSIONS.md`](architecture/PERMISSIONS.md): roles, scopes, actions, endpoint policies

### Design

- [`design/DESIGN_SYSTEM.md`](design/DESIGN_SYSTEM.md): canonical Verdana Health foundations, components, UX patterns, accessibility, and design QA
- [`design/tokens.json`](design/tokens.json): machine-readable primitive, semantic, and component tokens
- [`design/tokens.css`](design/tokens.css): Nuxt UI/Tailwind CSS token bridge
- [`design/app.config.example.ts`](design/app.config.example.ts): Nuxt UI runtime theme reference
- [`../design-system/internship-transcript-v2/MASTER.md`](../design-system/internship-transcript-v2/MASTER.md): hierarchical AI retrieval entry
- [`../desgin.md`](../desgin.md): information architecture, routes, and screen-level intent

`desgin.md` contains a legacy spelling error in the filename. Keep links stable until a dedicated documentation cleanup task renames it to `docs/design/DESIGN.md` and updates every reference atomically. The new `DESIGN_SYSTEM.md` has a separate purpose and is not that rename.

### Machine-readable contract

- [`api/openapi.yaml`](api/openapi.yaml): OpenAPI 3.1 target contract for `/api/v2`

Generated clients and DTO compatibility tests must derive from this file. Handwritten frontend API response types must not replace it.

### Operations

- [`operations/PRODUCTION_RUNBOOK.md`](operations/PRODUCTION_RUNBOOK.md): release preflight, deploy, smoke, rollback, backup/restore, and routine operations

## Evidence provenance

V2 analysis used the read-only legacy project:

```text
C:\Users\asus\Documents\GitHub\InternshipTranscript
```

Key evidence inspected:

- Express route registration under `/api/v1`
- Mongoose models for academic data, members, competencies, evaluations, email templates, settings, and documents
- Vue routes and project screens for admin, evaluator form, student dashboard, correspondence, competency, and document editor
- Vuex/API service calls
- mock authentication service
- deployment/environment configuration, with credential values redacted

Legacy behavior is evidence, not the V2 contract. Important differences:

- Legacy authorization is incomplete; V2 uses scoped backend enforcement.
- Legacy evaluation is one mutable record per student; V2 uses cycle/assignment/snapshot/draft/final workflow.
- Legacy templates use mutable `active`; V2 versions published artifacts and keeps them immutable.
- Legacy email/PDF paths are request/browser driven; V2 uses idempotent workers.
- Legacy endpoint shapes are inconsistent; V2 uses OpenAPI and standard errors.

## Requirement identifiers

Use stable prefixes in code, tests, commits, and reports:

- `FR-AUTH-*`: identity and authorization
- `FR-MEM-*`: academic/member/placement data
- `FR-EVL-*`: competency and evaluation
- `FR-MAIL-*`: correspondence
- `FR-DOC-*`: document template and PDF
- `FR-REP-*`: dashboard/report/export
- `NFR-*`: security, performance, reliability, accessibility, maintainability
- `AC-*`: acceptance scenario
- `FND`, `AUTH`, `DATA`, `EVL`, `MAIL`, `DOC`, `REP`, `MIG`, `OPS`: task families

## Change synchronization

When behavior changes, update all affected sources in one change:

| Change                    | Required synchronization                                           |
| ------------------------- | ------------------------------------------------------------------ |
| Endpoint/request/response | OpenAPI, DTO, generated client, contract test                      |
| Role or scope             | permissions, guard/policy, OpenAPI `x-permissions`, negative tests |
| Collection/index/state    | database doc, schema/index migration, integration tests            |
| User-visible workflow     | acceptance criteria, UI state, API behavior, E2E test              |
| Architecture decision     | System/Tech Stack plus ADR                                         |
| Environment variable      | `.env.example`, validation schema, deployment config, README       |
| Task completion           | `TASKS.md` and `AI_HANDOFF.md`                                     |

## Open decisions

See `AI_HANDOFF.md` for active blockers. Never convert `TBD` into a production value without owner approval.
