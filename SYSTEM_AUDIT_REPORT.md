# รายงานตรวจสอบ Logic, Flow และข้อบกพร่อง — Internship Transcript System V2

วันที่ตรวจสอบ: 18 กันยายน 2026  
ขอบเขต: Nuxt Web, NestJS API, Worker, MongoDB, Redis/BullMQ, Auth/RBAC, Student, Evaluation, Correspondence, PDF, Reporting และ OpenAPI  
วิธีตรวจ: static review, quality gates, runtime API verification และ isolated MongoDB audit database  
ข้อจำกัด: ไม่เชื่อม MFU OIDC, SMTP จริง, S3 Production หรือ Production database

## Executive summary

ระบบ build และ typecheck ผ่าน และ concurrency control ของ final evaluation ทำงานถูกต้อง แต่ยังไม่พร้อมเปิดใช้งานจริง เนื่องจากพบช่องโหว่ระดับวิกฤตใน PIN flow และข้อผิดพลาดระดับสูงด้าน authorization scope, idempotency, queue consistency และข้อมูลเอกสาร

ผลรวมที่ยืนยัน:

- P0 Critical: 2 รายการ
- P1 High: 11 รายการ
- P2 Medium: 7 รายการ
- Feature gap ที่ยังไม่ถือเป็น regression bug: 4 กลุ่ม

ข้อเสนอ release decision: **No-Go สำหรับ Production** จนกว่า `AUD-001` ถึง `AUD-009` จะถูกแก้และมี regression tests ผ่าน

## วิธีและสภาพแวดล้อมการตรวจ

- Clone ข้อมูล 29 collections รวม 522 documents จาก development database ไป `internship_transcript_v2_audit_20260918`
- เปิด API audit ที่ port `18081` และใช้ Redis database 15
- ไม่แตะ Production และไม่เปลี่ยน development database ที่มีนักศึกษา 165 คน
- หลังตรวจ หยุด audit API, ล้าง Redis database 15 และลบ audit database สำเร็จ
- MongoDB เป็น replica set `rs0` และรองรับ transaction
- Redis บนเครื่องเป็น `3.0.504`; BullMQ 6 ต้องการ Redis 5 ขึ้นไป

## ผล quality gates

| Gate                 | ผล      | หลักฐาน                                     |
| -------------------- | ------- | ------------------------------------------- |
| TypeScript typecheck | ผ่าน    | ทุก workspace package ผ่าน                  |
| Unit/component tests | ผ่าน    | 40 tests                                    |
| E2E foundation test  | ผ่าน    | 1 test                                      |
| OpenAPI lint/check   | ผ่าน    | schema valid และ generated client ไม่ drift |
| Production build     | ผ่าน    | API, Worker และ Nuxt/Nitro build สำเร็จ     |
| ESLint               | ไม่ผ่าน | Web: 5 errors, 1 warning                    |
| Prettier check       | ไม่ผ่าน | 41 files ไม่ตรงรูปแบบ                       |
| Root `pnpm verify`   | ไม่ผ่าน | หยุดที่ `format:check`                      |

การผ่าน OpenAPI check หมายถึงไฟล์ generated client ตรงกับ YAML เท่านั้น ไม่ได้ยืนยันว่า runtime routes ตรงกับ YAML

## รายการข้อบกพร่อง

### AUD-001 — Public endpoint เปิดเผย PIN และข้อมูลนักศึกษา

- Severity: **P0 Critical**
- Location: `apps/api/src/correspondence/correspondence.controller.ts:186`, `apps/api/src/correspondence/invitation.service.ts:189`
- Evidence: `GET /api/v2/public/evaluations/demo-pins` ไม่ต้อง authentication และ runtime ตอบ `200` พร้อม 54 records โดยมี `pin`, `studentId`, `studentName`, `assignmentId` และ `status`
- Impact: ผู้ใช้อินเทอร์เน็ตสามารถรับ credential สำหรับ evaluator แล้วเข้าดูหรือส่งแบบประเมินแทนผู้ประเมินได้
- Fix: ลบ route จาก Production; ถ้าต้องใช้ใน development ให้ register controller เฉพาะ `NODE_ENV=development`, คืนเฉพาะ synthetic fixtures และห้ามอ่าน assignment จริง
- Regression test: Production app ต้องตอบ `404`; development endpoint ต้องไม่คืนข้อมูลจาก persistent assignment collection

### AUD-002 — PIN คาดเดาได้และยอมรับ assignment ที่ส่งแล้ว

- Severity: **P0 Critical**
- Location: `apps/api/src/correspondence/invitation.service.ts:86-180`, `apps/web/app/pages/evaluate.vue:249-285`
- Evidence: PIN สร้างจาก `2026 + studentId`; fallback ยอมรับ `cleanPin.includes(studentId.slice(0, 8))`; runtime ใช้ PIN ของ assignment สถานะ `submitted` แล้วได้ `201` และ evaluator session
- Impact: credential entropy ต่ำ, brute force ง่าย, assignment ที่จบแล้วถูกเปิด session ใหม่ และ final answers อาจถูกเปิดเผย
- Fix: ใช้ random cryptographic token/PIN, เก็บ hash, ตรวจ invitation active, assignment mutable, deadline, evaluator binding และ one-time/reuse policy ก่อนออก session
- Regression test: submitted, expired, revoked, malformed และ reused PIN ต้องถูกปฏิเสธ; raw PIN ต้องไม่อยู่ใน DB หรือ response

### AUD-003 — PIN/auth endpoints ไม่มี rate limiting

- Severity: **P1 High**
- Location: `apps/api/src/main.ts:15-40`, `apps/api/src/correspondence/correspondence.controller.ts:130-188`
- Evidence: ไม่พบ throttling module/middleware; ส่ง PIN ผิด 30 ครั้งติดต่อกันได้ `401` ทั้ง 30 ครั้งและไม่มี `429`
- Impact: brute-force PIN, login abuse และ resource exhaustion
- Fix: rate limit แยกตาม IP และ credential fingerprint; เพิ่ม progressive delay/temporary lock; health endpoint ใช้ limit ต่างหาก
- Regression test: เกิน threshold ต้องได้ `429` พร้อม retry metadata โดยไม่เปิดเผยว่า PIN ใดมีอยู่

### AUD-004 — Placement scope ถูกประกอบผิดและ query เขียนทับ own-student constraint

- Severity: **P1 High**
- Location: `apps/api/src/members/members.service.ts:181-202`, `apps/api/src/common/scope.ts:24-37`
- Evidence: student ที่มีเฉพาะ `studentId` ได้ placement 0 รายการเพราะ base filter เป็น `{ _id: null }`; เมื่อ actor มี student scope ร่วมกับ school scope ค่า `input.studentId` เขียนทับ own ID และ runtime อ่าน placement ของนักศึกษาคนอื่นใน school เดียวกันได้ 1 รายการ
- Impact: บางบัญชีใช้งานไม่ได้ ขณะที่บาง scope combination เกิด IDOR
- Fix: สร้าง immutable `$and` clauses; own-student constraint ต้องถูกเพิ่มหลัง user filters และ user filters ห้ามแทน security filter
- Regression test: student เห็น placement ตัวเองเสมอและไม่เห็นผู้อื่น แม้ส่ง `studentId`, `schoolId` หรือ `programId` ที่เจาะจง

### AUD-005 — Idempotency lookup เกิดก่อน authorization scope

- Severity: **P1 High**
- Location: `apps/api/src/evaluations/evaluations.service.ts:320-344`, `apps/api/src/documents/documents.service.ts:137-179`, `apps/api/src/correspondence/campaign.service.ts:99-106`
- Evidence: evaluator ของ assignment A ส่ง assignment B พร้อม idempotency key ที่มีอยู่แล้วและ runtime ได้ evaluation ของ B ด้วย `201`; student ใช้ idempotency key ของเอกสารคนอื่นแล้วได้ record เอกสารคนนั้นด้วย `201`
- Impact: cross-scope data disclosure, incorrect retry result และ idempotency key collision ข้ามผู้ใช้
- Fix: ตรวจ actor scope และ bind key กับ actor, operation และ canonical request hash ก่อนคืน existing resource; unique index ต้องรวม owner/operation ตาม contract
- Regression test: key เดียวกันกับ actor หรือ payload ต่างกันต้องได้ `404/409`; retry ของ actor/payload เดิมเท่านั้นที่คืน resource เดิม

### AUD-006 — Queue readiness รายงานพร้อมทั้งที่ BullMQ ใช้งานไม่ได้

- Severity: **P1 High**
- Location: `apps/api/src/health.service.ts`, `apps/api/src/app.module.ts:75-82`
- Evidence: `/health/ready` รายงาน Redis `ok`; ขณะเปิด audit API BullMQ แจ้ง `Redis version needs to be greater or equal than 5.0.0 Current: 3.0.504` แต่ API ยัง start สำเร็จ
- Impact: orchestrator ส่ง traffic เข้าระบบที่รับงาน email/PDF ได้แต่ประมวลผลไม่ได้
- Fix: readiness ต้องตรวจ queue-compatible Redis version และ queue connection; startup ควร fail fast เมื่อ mandatory queue backend ใช้งานไม่ได้
- Regression test: Redis ต่ำกว่า minimum หรือ queue connection fail ต้องทำ readiness เป็น `503`

### AUD-007 — Direct invitation และ document generation ไม่ atomic

- Severity: **P1 High**
- Location: `apps/api/src/correspondence/campaign.service.ts:223-465`, `apps/api/src/documents/documents.service.ts:158-177`
- Evidence: เมื่อ queue add ล้ม direct invitation ตอบ `500` แต่ยังสร้าง evaluator, placement, assignment, invitation, campaign และ delivery อย่างละ 1 record; document generation ตอบ `500` แต่ทิ้ง generated document สถานะ `queued`
- Impact: ผู้ใช้ retry แล้วเกิดข้อมูลซ้ำ, status ค้าง และงานไม่มี queue job
- Fix: ใช้ Mongo transaction ร่วมกับ transactional outbox; worker/dispatcher enqueue จาก outbox แบบ idempotent; ห้ามตอบ failure หลัง commit โดยไม่มี reconciliation marker
- Regression test: จำลอง queue failure แล้วต้อง rollback ทั้งหมดหรือมี outbox pending ที่ dispatcher กู้คืนได้

### AUD-008 — Email worker ใช้ student reference คนละชนิดกับ direct invitation

- Severity: **P1 High**
- Location: `apps/api/src/correspondence/campaign.service.ts:359-371`, `apps/worker/src/runtime/email.processor.ts:84-88`
- Evidence: direct invitation เก็บ `assignment.studentId` เป็นรหัสนักศึกษา เช่น `6331006124`; worker ใช้ `Student.findById(assignment.studentId)` ซึ่งต้องการ Mongo `_id`
- Impact: invitation ถูกสร้างและ UI แจ้งสำเร็จ แต่ worker ล้มด้วย invalid/missing recipient source
- Fix: กำหนด canonical reference เป็น Mongo ObjectId หรือเพิ่ม `studentRecordId` แยกจาก business `studentId`; ทุก producer/consumer ใช้ field เดียวกัน
- Regression test: direct invitation ของนักศึกษาที่ใช้ business ID ต้อง render email ได้และส่งผ่าน fake SMTP

### AUD-009 — Queue claim อนุญาต duplicate processing และ campaign ไม่จบสถานะ

- Severity: **P1 High**
- Location: `apps/worker/src/runtime/email.processor.ts:56-65`, `apps/worker/src/runtime/document.processor.ts:53-62`, `apps/api/src/correspondence/campaign.service.ts:113-165`
- Evidence: worker claim record ที่เป็น `sending/processing` ได้อีกครั้ง; ไม่พบ code update campaign เป็น `processing/completed/partial`
- Impact: duplicate email/PDF processing, campaign ค้าง `queued`, dashboard progress ผิด และ retry reconciliation ทำไม่ได้
- Fix: atomic claim เฉพาะ claimable state พร้อม lease/attempt token; เพิ่ม campaign aggregator หลังทุก delivery transition; รองรับ `uncertain` เมื่อ provider ส่งสำเร็จแต่ persistence ล้ม
- Regression test: duplicate jobs พร้อมกันต้องส่ง side effect ครั้งเดียว; campaign ต้องจบตาม delivery outcomes

### AUD-010 — Correspondence endpoints ไม่บังคับ actor scope

- Severity: **P1 High**
- Location: `apps/api/src/correspondence/correspondence.controller.ts:92-127`, `apps/api/src/correspondence/campaign.service.ts:80-220`
- Evidence: preview/get/list/retry ไม่รับ actor; create/send โหลด assignment/student ด้วย ID โดยไม่มี `scopeFilter` หรือ `assertActorScope`
- Impact: staff/coordinator แบบจำกัด school/program อาจอ่าน campaign หรือส่ง invitation ข้าม scope
- Fix: ส่ง actor เข้า service ทุก method; resolve assignment/student ภายใต้ scope ก่อน preview/create/read/retry
- Regression test: school A ต้องไม่ preview, send, read หรือ retry resource ของ school B

### AUD-011 — Document generation ไม่ตรวจว่า evaluation เป็นของ student เดียวกัน

- Severity: **P1 High**
- Location: `apps/api/src/documents/documents.service.ts:137-179`, `apps/worker/src/runtime/document.processor.ts:65-74`
- Evidence: API รับ arbitrary `evaluationIds`; audit request ที่อ้าง evaluation ของนักศึกษาคนอื่นสร้าง queued document record สำเร็จก่อน queue error; worker query evaluations ตาม ID โดยไม่ตรวจ assignment/student ownership
- Impact: transcript/PDF อาจรวมผลประเมินผิดคนและเปิดเผยข้อมูลข้ามนักศึกษา
- Fix: resolve student canonical ID; join evaluation กับ assignment และยืนยัน student/scope/version ก่อน enqueue; snapshot approved source IDs ใน job record
- Regression test: foreign evaluation ID ต้องได้ `422/404` และไม่สร้าง document/outbox

### AUD-012 — Reporting นับเอกสารข้าม scope

- Severity: **P1 High**
- Location: `apps/api/src/reports/reports.service.ts:25-67`
- Evidence: coordinator จำกัดหนึ่ง school ได้ `readyDocuments=4` เท่าทั้งระบบ ขณะที่ expected scoped count เท่ากับ 3
- Impact: dashboard เปิดเผย operational counts ข้ามหน่วยงานและ KPI ผิด
- Fix: derive allowed student IDs จาก actor scope แล้วใช้กับ assignments, documents และ deliveries ทุก metric
- Regression test: coordinator/auditor แต่ละ scope ต้องได้ count เฉพาะ resource ที่มองเห็นจริง

### AUD-013 — Role/status revocation ไม่กระทบ refresh session

- Severity: **P1 High**
- Location: `apps/api/src/auth/session.service.ts:37-48`, `apps/api/src/auth/token.service.ts:26-71`
- Evidence: refresh token ฝัง actor/roles/scope และ refresh ออก access token จาก claims เดิมโดยไม่ reload user/status/role assignments
- Impact: ผู้ใช้ที่ถูก disable หรือลดสิทธิ์ยังต่ออายุ access ได้จน refresh session หมดอายุ
- Fix: refresh จาก server-side session แล้ว reload active user/role assignments; revoke sessions เมื่อ account/role เปลี่ยน; rotate refresh token ทุกครั้ง
- Regression test: disable user หรือ revoke role แล้ว refresh เดิมต้องล้มทันที

### AUD-014 — UI กลบ API failure ด้วยข้อมูลสมมติ

- Severity: **P2 Medium**
- Location: `apps/web/app/pages/app/index.vue:165-244`, `apps/web/app/pages/evaluate.vue:249-285`
- Evidence: หลาย API calls ใช้ `.catch(() => ({ items: [] }))` แล้วสร้าง `std-default`, `plc-default`, `asgn-default`; evaluate page fallback เป็น PIN จริงรูปแบบคาดเดาได้
- Impact: ผู้ใช้เข้าใจว่าข้อมูลจริงพร้อม ทั้งที่ API ล้ม; dashboard และเอกสารอาจแสดงข้อมูลสมมติ
- Fix: แยก loading/empty/error states; demo fixtures ต้องอยู่ใน test-only adapter และไม่ bundle ใน Production
- Regression test: API `500/401` ต้องแสดง error state และไม่มีชื่อ, PIN หรือ record สมมติ

### AUD-015 — Access token ถูกเปิดเผยต่อ JavaScript

- Severity: **P2 Medium**
- Location: `apps/web/app/stores/auth.ts:9-23`, `apps/api/src/correspondence/correspondence.controller.ts:179-183`, `apps/api/src/auth/dev-auth.controller.ts:35-76`
- Evidence: access token ถูกส่งใน response และเก็บใน `sessionStorage` แม้ระบบตั้ง HttpOnly cookie แล้ว
- Impact: XSS สามารถขโมย bearer token และ bypass ประโยชน์ของ HttpOnly cookie
- Fix: Production ใช้ HttpOnly cookie เพียงช่องทางเดียว; response คืน actor/session metadata เท่านั้น; dev token response แยกเฉพาะ test harness
- Regression test: auth/invitation/PIN responses ใน Production ต้องไม่มี token และ browser storage ต้องไม่มี credential

### AUD-016 — Search รับ raw regular expression และ malformed input ทำ API 500

- Severity: **P2 Medium**
- Location: `apps/api/src/members/members.service.ts:55-68`, `apps/api/src/system-settings/general-settings.service.ts:150-155`
- Evidence: `search=[` บน `/students` ตอบ `500 INTERNAL_ERROR`; search string ถูกส่งตรงเข้า `$regex`
- Impact: malformed search ทำ endpoint ล้ม; complex regex ใช้ CPU สูงได้
- Fix: escape regex metacharacters หรือใช้ normalized text index; จำกัด length/complexity และคืน validation error
- Regression test: `[`, `.*`, nested quantifier และ Unicode input ต้องไม่ทำ 500 หรือ unbounded query

### AUD-017 — Audit log ไม่ครอบคลุม failure/public mutations และอาจทำ mutation สำเร็จกลายเป็น 500

- Severity: **P2 Medium**
- Location: `apps/api/src/audit/audit.interceptor.ts:17-39`, `apps/api/src/audit/audit.service.ts:24-26`
- Evidence: interceptor ข้าม request ที่ยังไม่มี `request.actor`, บันทึกเฉพาะ successful observable และรอ audit insert หลัง business mutation
- Impact: PIN exchange/dev login/failure events ขาด audit; ถ้า audit insert ล้ม client ได้ 500 หลังข้อมูลธุรกิจถูกแก้แล้ว
- Fix: บันทึก success/failure ด้วย sanitized metadata; ใช้ outbox หรือ non-blocking durable audit policy; attach issued actor สำหรับ public exchange event
- Regression test: success, validation failure, permission denial และ audit-store failure ต้องมีผลลัพธ์ตาม policy โดยไม่สร้าง duplicate business mutation

### AUD-018 — OpenAPI กับ runtime routes/status enums ไม่ตรงกัน

- Severity: **P2 Medium**
- Location: `docs/api/openapi.yaml:519-575`, `docs/api/openapi.yaml:1632-1689`, `apps/api/src/correspondence/correspondence.controller.ts:62-189`, `apps/api/src/system-settings/general-settings.controller.ts:50-104`
- Evidence: OpenAPI ประกาศ student import/export routes ที่ไม่มี controller; runtime มี direct invitation, verify PIN, demo PIN, provinces/general settings และ academic update routes ที่ไม่อยู่ใน OpenAPI; campaign/delivery status enums ต่างกัน
- Impact: generated client ไม่ครอบคลุม runtime, integration ใช้ endpoint ที่ไม่มีจริง และ monitoring/documentation ผิด
- Fix: เลือก canonical contract แล้วเพิ่ม route-conformance test ที่ enumerate Nest routes เทียบ OpenAPI; feature ที่ยังไม่ทำต้องถอดออกหรือระบุ `501` อย่างชัดเจน
- Regression test: ทุก Production route/method ต้องมี OpenAPI operation และทุก operation ต้องมี runtime handler

### AUD-019 — Document template publish validation อ่อนกว่าที่ worker ต้องการ

- Severity: **P2 Medium**
- Location: `apps/api/src/documents/documents.service.ts:108-134`, `apps/worker/src/runtime/document.processor.ts:147-181`
- Evidence: publish ตรวจเพียง width/height/elements array/font list; element type, coordinates, font size, placeholders และ font object existence ตรวจตอน worker เท่านั้น
- Impact: template publish สำเร็จ แต่ทุก generation job ล้มภายหลัง
- Fix: ใช้ canonical schema เดียวกันใน API และ Worker; preflight font/object/placeholder ก่อน publish
- Regression test: malformed element, unknown placeholder, missing font และ non-finite geometry ต้อง publish ไม่ผ่าน

### AUD-020 — Automated tests ไม่ครอบคลุม critical flows

- Severity: **P2 Medium**
- Location: `apps/api/test`, `apps/worker/test`, `apps/web/test`, `tests/e2e`
- Evidence: API tests มีเฉพาะ health, policy, SMTP schema และ PIN utility; Worker มี health test เดียว; E2E ตรวจ Node runtime เท่านั้น
- Impact: authorization, queue, transaction, worker และ UI regressions ผ่าน CI ได้
- Fix: เพิ่ม integration suites ตาม regression matrix ด้านล่าง และใช้ isolated Mongo replica set/Redis 7/fake SMTP/S3 ใน CI
- Regression test: coverage ต้องเน้น behavior gates ไม่ใช่เปอร์เซ็นต์เพียงอย่างเดียว

## Flow matrix ที่ต้องเพิ่มเป็น regression suite

| Flow                       | systemAdmin   | internshipStaff | coordinator    | student  | evaluator       | auditor                  |
| -------------------------- | ------------- | --------------- | -------------- | -------- | --------------- | ------------------------ |
| Student/placement read     | tenant        | assigned scope  | assigned scope | own only | deny/minimum    | assigned scope           |
| Student/placement mutation | allowed       | assigned scope  | denied         | denied   | denied          | denied                   |
| Evaluation read            | tenant        | assigned scope  | assigned scope | own      | assignment only | assigned scope           |
| Draft/submit               | denied        | denied          | denied         | denied   | assignment only | denied                   |
| Campaign send/retry        | policy        | assigned scope  | denied         | denied   | denied          | denied                   |
| Document generate/read     | scoped policy | assigned scope  | read scope     | own      | denied          | read scope               |
| Reports/audit              | tenant        | assigned scope  | assigned scope | own      | minimum         | assigned scope/read-only |

ทุก cell ต้องทดสอบ allow case, deny case, foreign ID, malicious query filter และ idempotency collision

## State-transition tests

1. Cycle: draft → active; invalid window/unpublished competency ต้องถูกปฏิเสธ
2. Assignment: pending → inProgress → submitted; expired/submitted ห้ามแก้
3. Draft: revision เพิ่มแบบ optimistic; stale revision ได้ `409`
4. Submit: concurrent requests สร้าง final record เดียว
5. Invitation: active/expired/revoked/reused ตาม approved policy
6. Delivery: queued → sending → sent/failed/uncertain; retry ห้ามส่งซ้ำ
7. Campaign: queued → processing → completed/partial
8. Document: queued → processing → ready/failed; source snapshot และ ownership ต้องคงที่

ผล runtime concurrency ปัจจุบัน: request พร้อมกัน 2 รายการได้ `201` หนึ่งรายการ, `409` หนึ่งรายการ, final evaluation 1 record และ assignment เป็น `submitted` ถือว่าผ่าน

## Feature gaps — ไม่จัดเป็น regression bug

- Student bulk import มี local script แต่ยังไม่มี OpenAPI preview/commit controller และ UI workflow
- Export endpoints ยังไม่มี implementation
- Reopen policy ตั้งใจตอบ `REOPEN_POLICY_NOT_CONFIGURED` จนกว่า owner อนุมัติ
- Multi-evaluator aggregation, score visibility และ hard/soft/situation question import ยังรอ product decision/implementation

## ลำดับแก้ที่แนะนำ

1. ปิด public demo PIN และเปลี่ยน PIN authentication ทั้งชุด
2. แก้ scope/idempotency authorization ก่อน lookup ทุกจุด
3. ทำ invitation/document เป็น transaction + outbox และแก้ canonical student reference
4. แก้ queue claim, readiness และ campaign reconciliation
5. แก้ document/report ownership และ token lifecycle
6. ลบ fake UI fallbacks และทำ runtime/OpenAPI parity
7. เพิ่ม regression suites แล้วปิด lint/format gates

## Release acceptance

Production release ทำได้เมื่อ:

- `AUD-001` ถึง `AUD-009` มี regression tests และผ่านทั้งหมด
- ไม่มี public endpoint คืน credential/PII
- ทุก role ผ่าน allow/deny scope matrix
- queue failure ไม่ทิ้ง orphaned records และ readiness สะท้อน queue จริง
- runtime routes ตรง OpenAPI
- `pnpm verify` ผ่านทั้งหมด
- real OIDC, approved SMTP, private S3, backup/restore และ incident runbook ผ่าน UAT แยก
