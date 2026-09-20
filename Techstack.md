# Tech Stack: Internship Transcript System V2

## 1. จุดประสงค์

กำหนดเทคโนโลยีเป้าหมายสำหรับ V2 โดยยึดฟังก์ชันที่มีอยู่จริงใน `InternshipTranscript` ลด technical debt และทำให้ระบบปลอดภัย ทดสอบได้ และดูแลต่อได้

## 2. As-Is กับ To-Be

| Layer      | ระบบเดิมที่ตรวจพบ                                 | V2 ที่เสนอ                                                     | เหตุผล                                                                                        |
| ---------- | ------------------------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Frontend   | Vue 2.6 + Vue CLI + JavaScript                    | Nuxt 4 + Vue 3 + TypeScript                                    | ได้ file-based routing, SSR/hybrid rendering, auto-import และ type support ใน framework เดียว |
| State      | Vuex 3                                            | Pinia ผ่าน `@pinia/nuxt`                                       | API กระชับ รองรับ type inference และทำงานร่วมกับ Nuxt lifecycle                               |
| UI         | CoreUI Pro 3 + Bootstrap                          | Nuxt UI                                                        | ใช้ component system ที่ออกแบบมาสำหรับ Nuxt, theme ได้ และลดภาระดูแล UI พื้นฐาน               |
| Backend    | Express + JavaScript                              | NestJS + TypeScript บน Express/Fastify adapter                 | module, DTO, guard, DI, testability และ OpenAPI เป็นระบบ                                      |
| Runtime    | Node 14/16/20 ปะปน                                | Node.js 24 LTS                                                 | ใช้ Production บน LTS เดียว; Node 20 สิ้นสุด support แล้ว ณ วันที่จัดทำเอกสาร                 |
| Database   | MongoDB + Mongoose 5 อยู่ใน devDependencies       | MongoDB Atlas/Community + Mongoose รุ่นรองรับ runtime          | type-safe schema, index และ production support                                                |
| Realtime   | Socket.IO echo event                              | ใช้เฉพาะ job/status notification ที่มี requirement             | ตัด dependency ที่ไม่มี business value                                                        |
| Queue      | Redis helper แบบ localhost                        | Redis + BullMQ หรือ queue เทียบเท่า                            | email/PDF retry, idempotency และ monitoring                                                   |
| Email      | Nodemailer SMTP                                   | Nodemailer ผ่าน worker + provider credential ใน secret manager | ไม่ block API และติดตาม delivery ได้                                                          |
| Document   | Konva JSON + jsPDF ฝั่ง browser                   | Konva editor + server-side rendering worker                    | output สม่ำเสมอ มี checksum และ audit                                                         |
| API docs   | Swagger JSON หลายไฟล์ merge                       | OpenAPI generate จาก DTO/decorator                             | contract ตรงกับโค้ด                                                                           |
| Test       | Backend test placeholder, frontend template tests | Unit + integration + contract + E2E                            | ป้องกัน regression ใน workflow สำคัญ                                                          |
| Deployment | Render/Vercel/Docker หลายแบบ                      | Nuxt/Nitro web + Docker image ต่อ API/worker + CI/CD           | รองรับ hybrid rendering, deploy ซ้ำได้ และ rollback ได้                                       |

## 3. Runtime baseline

### Node.js

- ใช้ Node.js 24 LTS สำหรับ V2 ณ วันที่เริ่มโครงการ
- ห้ามใช้ Node version ที่เป็น EOL ใน Production
- pin version ใน `.nvmrc`, `engines`, Docker base image และ CI
- review runtime อย่างน้อยทุก 6 เดือน

Node.js แนะนำให้ Production ใช้ Active LTS หรือ Maintenance LTS เท่านั้น และหน้า release ระบุ Node 24 เป็น LTS ณ สิงหาคม 2026: [Node.js Releases](https://nodejs.org/en/about/previous-releases)

### Package manager

- เลือก `pnpm` ทั้ง monorepo และ CI
- commit `pnpm-lock.yaml`
- CI ใช้ frozen lockfile
- ห้ามมี `package-lock.json` และ `pnpm-lock.yaml` สำหรับ workspace เดียวกัน

## 4. Repository structure ที่เสนอ

```text
Intership v.2/
├─ apps/
│  ├─ web/                 # Nuxt 4 web application
│  │  ├─ app/
│  │  │  ├─ pages/        # File-based routes
│  │  │  ├─ layouts/
│  │  │  ├─ components/
│  │  │  ├─ composables/
│  │  │  ├─ middleware/
│  │  │  └─ stores/
│  │  ├─ server/          # Thin BFF/proxy only; no domain logic
│  │  ├─ public/
│  │  ├─ app.config.ts
│  │  └─ nuxt.config.ts
│  ├─ api/                 # NestJS REST API
│  └─ worker/              # Email/PDF background jobs
├─ packages/
│  ├─ api-client/          # Generated OpenAPI client
│  ├─ shared-types/        # Non-API shared types only
│  ├─ design-tokens/       # Color, type, spacing tokens
│  └─ config/              # ESLint/TypeScript shared config
├─ infrastructure/
│  ├─ docker/
│  └─ scripts/
├─ docs/
├─ .env.development
├─ .env.production
├─ .env.example
├─ pnpm-workspace.yaml
└─ package.json
```

## 5. Frontend stack

### Core

- Nuxt 4 บน Vue 3
- TypeScript strict mode
- Nuxt file-based routing และ route middleware
- Pinia ผ่าน `@pinia/nuxt`
- Nuxt I18n สำหรับภาษาไทย/อังกฤษ
- `useFetch`, `useAsyncData` และ `$fetch` ร่วมกับ type/client ที่ generate จาก OpenAPI
- Nitro ใช้เฉพาะ SSR, session handling, proxy และ thin BFF; business rule หลักอยู่ใน NestJS API

Nuxt 4 ใช้ Vue, รองรับ TypeScript, file-based routing, data fetching, SSR และ hybrid rendering ในตัว: [Nuxt Introduction](https://nuxt.com/docs/4.x/getting-started/introduction)

#### Rendering strategy

- ใช้ hybrid rendering ผ่าน `routeRules` แทนการบังคับทั้งระบบเป็น SPA หรือ SSR แบบเดียว
- หน้า public เช่น login, invitation landing และ help ใช้ SSR/prerender เมื่อเหมาะสม
- หน้า authenticated dashboard ใช้ SSR ได้เมื่อไม่มี browser-only dependency
- หน้า document canvas/Konva ห่อด้วย `<ClientOnly>` หรือกำหนด client-side rendering เฉพาะ route
- ห้ามเรียก API/อ่าน secret ฝั่ง client โดยตรงเมื่อทำผ่าน Nitro server route หรือ NestJS API ได้

### UI and visualization

- Component library: Nuxt UI เป็นมาตรฐานหลักของทั้งระบบ
- Theme และ design token กำหนดส่วนกลางผ่าน `app.config.ts` และ CSS variables
- สร้าง wrapper เฉพาะ component ที่มี domain behavior; ไม่ fork component ของ Nuxt UI โดยไม่จำเป็น
- Chart: Chart.js ผ่าน wrapper ที่รองรับ Vue 3
- Document canvas: Konva + Vue integration ที่รองรับ Vue 3 และโหลดแบบ client-only
- Form: schema validation เช่น Zod/Valibot ร่วมกับ form library ที่ทีมเลือก
- Date: native `Intl` และ date library เฉพาะเมื่อจำเป็น

Nuxt UI มีวิธีติดตั้งเป็น Nuxt module และใช้ component/theme ในแอป Nuxt: [Nuxt UI — Nuxt installation](https://ui.nuxt.com/getting-started/installation/nuxt)

### Frontend standards

- ใช้ convention ของ Nuxt ใน `app/pages`, `app/layouts`, `app/components`, `app/composables`, `app/middleware` และ `app/stores`
- ภายในแต่ละส่วนจัดตาม domain เช่น evaluations, documents และ members โดยไม่ฝืน file-based routing
- API response ห้ามใช้ `any` ใน production feature
- server state แยกจาก UI state
- route middleware และ page metadata ระบุ required role/permission
- ค่า public runtime ใช้ `runtimeConfig.public`; secret ห้ามอยู่ใน public config หรือ client bundle
- component ต้องมี loading, empty, error และ permission-denied state
- test component ที่มี business logic และ E2E core flows

## 6. Backend stack

### Framework

- NestJS + TypeScript strict
- เลือก Express adapter เพื่อ migration ง่าย หรือ Fastify หาก load test ยืนยันประโยชน์
- Nest Config สำหรับ environment validation
- class-validator/class-transformer หรือ schema validator ที่ integrate กับ DTO
- Swagger/OpenAPI generate จาก controller/DTO

NestJS รองรับ TypeScript และต้องใช้ Node.js อย่างน้อย 20 ตาม official documentation: [NestJS First Steps](https://docs.nestjs.com/first-steps)

### Backend modules

```text
src/
├─ auth/
├─ users/
├─ academic/
├─ organizations/
├─ placements/
├─ competencies/
├─ evaluations/
├─ correspondence/
├─ documents/
├─ reports/
├─ audit/
├─ health/
└─ common/
```

แต่ละ module มี controller, service/use-case, repository, DTO, schema และ tests ของตน ห้ามให้ controller เรียก Mongoose model โดยตรง

### API conventions

- Base path `/api/v2`
- JSON ใช้ camelCase
- error shape เดียว: `code`, `message`, `details`, `requestId`
- pagination ใช้ `page/limit` ใน admin list ระยะแรก หรือ cursor สำหรับข้อมูลใหญ่
- PUT ใช้ replace เมื่อจำเป็น; PATCH ใช้ partial update
- delete ข้อมูลสำคัญใช้ soft delete/archive
- mutation รองรับ optimistic concurrency ผ่าน `version` หรือ `updatedAt`
- bulk action ต้องมี dry-run/preview และผลลัพธ์ราย record

## 7. Authentication and authorization

- Internal user: MFU SSO/OIDC หรือ Google Workspace OAuth ตาม policy
- External evaluator: signed invitation + OTP/verification ตามระดับความเสี่ยง
- Access token อายุสั้น; refresh token เก็บแบบ secure, httpOnly และหมุนเวียน
- Password หรือ token secret ไม่อยู่ใน source
- NestJS guard บังคับ authentication และ policy
- RBAC roles: systemAdmin, internshipStaff, coordinator, student, evaluator, auditor
- resource scope: School/Program/Student ownership

NestJS มีแนวทาง official สำหรับ JWT guard และ authentication: [NestJS Authentication](https://docs.nestjs.com/security/authentication)

## 8. Database and data access

- MongoDB เป็น primary database
- Mongoose + TypeScript schema inference/interface
- replica set/Atlas ใน Production เพื่อรองรับ availability และ transaction ที่จำเป็น
- local MongoDB ใน Development
- repository layer ซ่อนรายละเอียด Mongoose จาก use case
- migrations เป็น versioned scripts ที่ idempotent และมี dry-run

Mongoose รองรับ TypeScript โดยตรงและกำหนด ObjectId type อย่างชัดเจน: [Mongoose TypeScript Support](https://mongoosejs.com/docs/8.x/docs/typescript.html)

MongoDB Atlas ลดภาระด้าน availability, backup และ security configuration แต่ยังต้องกำหนด RBAC/network/backup ให้เหมาะสม: [MongoDB Atlas Production Notes](https://www.mongodb.com/docs/atlas/production-notes/)

## 9. Queue, cache and jobs

### Queue

- Redis + BullMQ
- queues: `email`, `pdf`, `import`, `export`
- job มี `jobId`/idempotency key
- retry exponential backoff และ maximum attempts
- failed job เก็บเหตุผลแบบไม่เปิดเผย secret
- admin ดู queue status และ retry เฉพาะผู้มีสิทธิ์

### Cache

- cache เฉพาะ master data/read model ที่พิสูจน์แล้วว่าจำเป็น
- key มี namespace และ version
- TTL ชัดเจน
- mutation ต้อง invalidate
- ห้าม cache permission-sensitive response โดยไม่รวม user scope

## 10. Document generation

### Editor

- เก็บ document template เป็น canonical JSON schema ที่ version ได้
- canvas A4 รองรับ text, image, competency table, suggestion block, radar/bar graph
- placeholder ใช้ชื่อมาตรฐาน เช่น `student.fullName`, `student.studentId`
- validate placeholder ตอน publish
- published version immutable

### Renderer

- worker โหลด template version + data snapshot
- render font ไทย/อังกฤษแบบ deterministic
- สร้าง PDF พร้อม metadata, checksum และ generation timestamp
- เก็บไฟล์ใน S3-compatible object storage
- client รับ signed URL ที่หมดอายุ
- regression test เปรียบเทียบภาพหรือ PDF metadata สำหรับ template สำคัญ

## 11. Email

- Nodemailer หรือ provider SDK ผ่าน worker
- template แยก subject/text/html
- placeholder compiler ต้อง escape HTML ตามบริบท
- delivery record เก็บ providerMessageId, status, attempts และ timestamps
- suppression/invalid recipient handling
- invitation URL มาจาก `PUBLIC_WEB_URL` ไม่ hard-code localhost
- Development ใช้ mail sandbox

## 12. Observability

- Structured logger เช่น Pino
- OpenTelemetry traces หาก platform รองรับ
- Metrics: HTTP latency/error, Mongo pool, queue depth, job failure, email/PDF duration
- Error tracking เช่น Sentry หรือ platform equivalent
- request ID ส่งต่อจาก web/API/worker
- redact Authorization, Cookie, MongoDB URI, SMTP credential และ PII ที่ไม่จำเป็น

## 13. Testing stack

| ระดับ           | เครื่องมือเสนอ                               | ขอบเขต                                                      |
| --------------- | -------------------------------------------- | ----------------------------------------------------------- |
| Unit            | Vitest/Jest                                  | use cases, validators, mapping, permission policy           |
| API integration | Jest + Supertest + disposable MongoDB        | controller/repository/index constraints                     |
| Contract        | OpenAPI schema validation                    | web client กับ API                                          |
| Component/Nuxt  | Vitest + Vue Test Utils + `@nuxt/test-utils` | page, composable, form, table, middleware, permission state |
| E2E             | Playwright                                   | login, invitation, submit, dashboard, PDF request           |
| Security        | dependency scan + SAST + secret scan         | pull request/release                                        |
| Performance     | k6 หรือ Artillery                            | dashboard, list, submit, generation request                 |
| Migration       | fixture + reconciliation tests               | old collection ไป V2                                        |

## 14. CI/CD

### Pull request pipeline

1. install ด้วย frozen lockfile
2. lint และ format check
3. typecheck
4. unit/integration tests
5. OpenAPI compatibility check
6. build web/api/worker
7. secret scan และ dependency scan
8. Docker image scan

### Deployment pipeline

1. build immutable image/tag ด้วย commit SHA
2. deploy staging
3. run migration dry-run และ smoke test
4. approval gate สำหรับ Production
5. backup/restore point ก่อน destructive migration
6. deploy API/worker/web
7. readiness และ smoke test
8. rollback เมื่อ gate ไม่ผ่าน

## 15. Environment configuration

### `.env.development`

```env
NODE_ENV=development
PORT=8081
MONGODB_URI=mongodb://localhost:27017/internship_transcript_v2_dev
REDIS_URL=redis://localhost:6379
PUBLIC_WEB_URL=http://localhost:8080
NUXT_PUBLIC_API_BASE_URL=http://localhost:8081/api/v2
```

### `.env.production`

```env
NODE_ENV=production
PORT=8081
MONGODB_URI=<INJECT_FROM_SECRET_MANAGER>
REDIS_URL=<INJECT_FROM_SECRET_MANAGER>
PUBLIC_WEB_URL=https://<PRODUCTION_WEB_DOMAIN>
NUXT_PUBLIC_API_BASE_URL=https://<PRODUCTION_API_DOMAIN>/api/v2
```

ไฟล์ Production จริงต้องอยู่ใน secret store/platform environment และไม่ commit ค่า credential ตัวอย่างข้างต้นเป็น schema เท่านั้น

ตัวแปร secret เพิ่มเติม:

- `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_ISSUER`
- `JWT_PRIVATE_KEY`/key reference
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`
- `OBJECT_STORAGE_ENDPOINT`, `OBJECT_STORAGE_BUCKET`, access credentials
- `INVITATION_TOKEN_PEPPER`

ต้อง validate environment ตอน startup และ fail fast เมื่อ Production ขาดค่าบังคับ

## 16. Migration approach

1. Freeze schema mapping จากระบบเดิม
2. เขียน adapter อ่าน collection เดิม
3. แปลงชื่อฟิลด์ผิดเป็นชื่อมาตรฐาน
4. สร้าง reference ใหม่และ mapping ID
5. migrate template JSON พร้อม schema version
6. สร้าง indexes หลังทำความสะอาด duplicate
7. compare counts, null rate, duplicates และ sampled values
8. dual-read เฉพาะเมื่อจำเป็น; หลีกเลี่ยง dual-write ระยะยาว
9. cutover พร้อม rollback window

## 17. เทคโนโลยีที่ไม่ควรนำมาใช้โดยไม่มี requirement

- microservices และ service mesh
- GraphQL เมื่อ REST ครอบคลุม use case
- vector database/LLM ใน core evaluation
- blockchain สำหรับ certificate
- Kubernetes สำหรับ workload ขนาดเล็กที่ platform managed รองรับอยู่แล้ว
- realtime socket สำหรับข้อมูลที่ polling/event refresh เพียงพอ

## 18. Technical risks

| ความเสี่ยง                                                 | การลดความเสี่ยง                                                                         |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Vue 2/Vue CLI/CoreUI ไป Nuxt 4/Nuxt UI มี breaking changes | ทำ route และ component inventory, migrate feature-by-feature และใช้ E2E เป็น safety net |
| Konva หรือ browser-only library ทำงานผิดระหว่าง SSR        | แยก client-only boundary และทดสอบ hydration ทุก route ที่เกี่ยวข้อง                     |
| Nitro server route ซ้ำ business logic กับ NestJS           | จำกัด Nitro เป็น SSR/session/proxy/BFF และบังคับ domain logic อยู่ใน NestJS module      |
| Template Konva เดิมโหลดใน renderer ใหม่ไม่ได้              | กำหนด schemaVersion และ adapter compatibility                                           |
| ข้อมูลเดิมมี reference หาย/ชื่อไม่สอดคล้อง                 | profiling, quarantine records, reconciliation report                                    |
| PDF ภาษาไทยต่างกันตาม font/runtime                         | bundle font ที่อนุญาตและ visual regression                                              |
| SMTP retry ส่งซ้ำ                                          | idempotency key และ delivery state machine                                              |
| SSO requirement ยังไม่ชัด                                  | ทำ auth spike ก่อน build domain flow                                                    |

## 19. Decision records ที่ควรสร้าง

- ADR-001 Modular monolith
- ADR-002 Nuxt 4 hybrid rendering และขอบเขต Nitro/NestJS
- ADR-003 NestJS + MongoDB/Mongoose
- ADR-004 Evaluation snapshot and versioning
- ADR-005 Background jobs for email/PDF
- ADR-006 Object storage and signed URL
- ADR-007 Authentication provider and token strategy
- ADR-008 Data retention and audit policy
