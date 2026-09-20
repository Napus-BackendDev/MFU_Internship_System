# Terms of Reference (TOR)

## โครงการพัฒนาระบบ Internship Transcript System V2

| รายการ           | รายละเอียด                                      |
| ---------------- | ----------------------------------------------- |
| หน่วยงาน         | `[ระบุหน่วยงานเจ้าของโครงการ]`                  |
| เจ้าของผลิตภัณฑ์ | `[ระบุชื่อ/ตำแหน่ง]`                            |
| ผู้ควบคุมงาน     | `[ระบุชื่อ/ตำแหน่ง]`                            |
| เวอร์ชันเอกสาร   | Draft 0.1                                       |
| วันที่จัดทำ      | 23 สิงหาคม 2026                                 |
| สถานะ            | รอยืนยันขอบเขต งบประมาณ ระยะเวลา SLA และ policy |

> TOR ฉบับนี้เป็นข้อกำหนดเชิงเทคนิคและการส่งมอบที่สังเคราะห์จากระบบเดิม ตัวเลขเป้าหมายที่ระบุว่า “เสนอ” ยังไม่ถือเป็นข้อตกลงจนกว่าจะได้รับอนุมัติ

## 1. หลักการและเหตุผล

มหาวิทยาลัยต้องบริหารข้อมูลนักศึกษาฝึกงาน ผู้ประเมินจากสถานประกอบการ ชุดสมรรถนะ ผลประเมิน การติดตามสถานะ และการออก Internship Transcript ให้เป็นกระบวนการเดียว ระบบเดิมมีฟังก์ชันพื้นฐานดังกล่าว แต่ source code และเอกสารไม่สอดคล้องกัน การรักษาความปลอดภัยและสิทธิ์ยังไม่ครบ การจัดการ version ของแบบประเมิน/เอกสารยังไม่เป็นระบบ และการ deploy มี secret ปรากฏใน source configuration

จึงเสนอพัฒนา V2 เพื่อยกระดับความถูกต้อง ความปลอดภัย ความตรวจสอบย้อนกลับ ประสบการณ์ผู้ใช้ และความสามารถในการดูแลระยะยาว โดยยังคง MongoDB เป็นฐานข้อมูลหลักและรักษาข้อมูลสำคัญจากระบบเดิมผ่านกระบวนการ migration ที่ตรวจสอบได้

## 2. วัตถุประสงค์

1. พัฒนาระบบบริหารรอบประเมินฝึกงานแบบครบวงจร
2. สร้างระบบสิทธิ์ที่จำกัดการเข้าถึงตามบทบาทและเจ้าของข้อมูล
3. ทำให้ competency set, email template และ document template มี version/publish lifecycle
4. ลดงาน manual ในการเชิญ ติดตาม reminder และออกเอกสาร
5. จัดทำ dashboard และรายงานที่ตรวจสอบความถูกต้องได้
6. migrate ข้อมูลที่อนุมัติจากระบบเดิมโดยไม่สูญหายหรือซ้ำ
7. จัดให้มี test, audit, monitoring, backup, restore และเอกสารดูแลระบบ

## 3. ขอบเขตงาน

### 3.1 Discovery and requirements

- workshop กับเจ้าของระบบ Staff, Coordinator, Student และตัวแทน Evaluator
- ยืนยัน process map, role matrix, data owner และ approval flow
- วิเคราะห์ข้อมูลจริงโดยใช้ชุดสำเนาที่ anonymize
- จัดทำ requirement traceability matrix
- ยืนยัน acceptance dataset และ UAT scenarios

### 3.2 Identity and access management

- เชื่อม SSO/OIDC ที่หน่วยงานอนุมัติ
- จัด role และ permission ตาม `System.md`
- จำกัด scope ตาม School/Program และ resource ownership
- จัดการ session, logout, token expiry และ revocation
- สร้าง secure invitation สำหรับ external evaluator
- invitation token ต้อง hash, one-time use, expiry และ revoke ได้
- ปิด mock login และ fallback secret ใน Production

### 3.3 Academic master data

- School/Faculty
- Program/Major
- Course
- Academic Year, Term/Semester
- รองรับชื่อไทย/อังกฤษ
- import/export และ validation
- archive แทน hard delete เมื่อมีข้อมูลอ้างอิง

### 3.4 Organization and placement

- Organization/Company และ address/province/contact
- Student internship placement
- evaluator/adviser assignment
- รองรับหลาย evaluator ต่อ placement เมื่อ policy อนุญาต
- วันที่เริ่ม/สิ้นสุด สถานะ และ academic term
- ตรวจ duplicate และ invalid relation

### 3.5 Student management

- เพิ่ม แก้ archive ค้นหา และกรองนักศึกษา
- bulk import พร้อม preview, validation และ error report
- ผูก Student กับ Program, School, Course และ Placement
- เก็บข้อมูลเท่าที่จำเป็นตาม privacy policy
- view history ของการเปลี่ยนแปลงสำคัญ

### 3.6 Competency management

- สร้าง competency set ตามประเภท Soft skill, Hard skill และ Suggestion
- Hard skill กำหนดตาม Program ได้
- กำหนด bilingual title/description/question
- กำหนด scoring scale, required flag, weight และ display order
- lifecycle: Draft, Published, Retired
- published version ห้ามแก้; การแก้ต้องสร้าง version ใหม่
- preview form ก่อน publish

### 3.7 Evaluation cycle and assignment

- สร้าง evaluation cycle ตาม Academic Term
- เลือก competency set version
- สร้าง assignment ระหว่าง Student, Placement และ Evaluator
- กำหนด openAt, dueAt, closeAt
- สถานะ Draft, Open, Closed, Archived
- ป้องกัน assignment และ evaluation ซ้ำด้วย unique index

### 3.8 Evaluation form

- เปิดผ่าน authenticated session หรือ secure invitation
- แสดงข้อมูลนักศึกษาเท่าที่จำเป็น
- รองรับ desktop/tablet/mobile
- rating control ใช้งาน keyboard และ screen reader ได้
- save draft และ resume
- validate required criteria และ score range
- submit พร้อม confirmation
- หลัง submit lock; reopen ได้เฉพาะผู้มีสิทธิ์พร้อมเหตุผล
- บันทึก submittedAt, submittedBy, version และ audit event
- ป้องกัน duplicate submit จาก retry/double click

### 3.9 Correspondence

- email template ไทย/อังกฤษ แยก Student/Evaluator/Staff
- placeholder allowlist และ preview ด้วยข้อมูลตัวอย่าง
- campaign สำหรับ invitation/reminder/notification
- queue, retry, idempotency และ delivery status
- bulk send พร้อม progress และ failed recipient report
- URL ห้าม hard-code localhost ใน Production
- credential อยู่ใน secret manager

### 3.10 Dashboard and reporting

- KPI: assigned, invited, delivered, opened, draft, submitted, overdue, failed
- filter ตาม School, Program, Year, Term, Organization และ status
- Student list พร้อม server-side pagination
- report soft/hard skills และ distribution
- export CSV/XLSX/PDF ตามสิทธิ์
- ระบุ filter, generatedAt, timezone และ data scope ใน export
- มี accessible text/table alternative สำหรับกราฟ

### 3.11 Document template and generation

- editor ขนาด A4 รองรับ text, image, variable, table และ graph
- placeholder catalog ที่มี schema ชัดเจน
- template status Draft, Published, Retired
- version และ preview ก่อน publish
- validate missing/unknown placeholder
- server-side/background PDF generation
- ฝัง font ไทย/อังกฤษที่ได้รับอนุญาต
- เก็บ templateVersion, dataSnapshot, checksum และ generatedAt
- signed download URL ที่หมดอายุ
- Student ดาวน์โหลดเฉพาะเอกสารของตน

### 3.12 Audit and administration

- audit login, permission change, import, publish, submit, reopen, export และ delete/archive
- audit log แก้ย้อนหลังไม่ได้ด้วย business API
- หน้าค้น audit ตาม actor/action/resource/time
- system setting ที่มี version และ validation
- health/status page สำหรับ service และ queue ตามสิทธิ์

### 3.13 Migration

- inventory collection และ field จากระบบเดิม
- mapping old-to-new พร้อม mapping ฟิลด์สะกดผิด
- rotate/revoke credential ที่เคย commit และลบจาก history ตามแผน incident
- data cleansing และ duplicate handling
- migration dry-run อย่างน้อย 1 รอบก่อน production cutover
- reconciliation: counts, references, duplicate, null rate, sample hash
- quarantine record ที่แปลงไม่ได้โดยไม่ทิ้งเงียบ
- rollback plan และ cutover runbook

### 3.14 DevOps and operations

- Development และ Production environment แยกกัน
- `.env.development` ใช้ local MongoDB
- `.env.production` รับ remote MongoDB URI จาก secret manager
- Docker images แบบ reproducible
- CI: lint, typecheck, test, build, security scan
- CD: staging, approval gate, smoke test และ rollback
- central logging, metrics, alerting
- backup/restore และ disaster recovery drill

## 4. Functional requirements

### Identity

| ID          | Requirement                                                       | Priority |
| ----------- | ----------------------------------------------------------------- | -------- |
| FR-AUTH-001 | ระบบต้องยืนยันตัวตนผู้ใช้ภายในผ่าน provider ที่อนุมัติ            | Must     |
| FR-AUTH-002 | ระบบต้องตรวจ role และ resource scope ที่ backend ทุก request      | Must     |
| FR-AUTH-003 | external invitation ต้องหมดอายุ revoke และใช้ซ้ำตาม policy ไม่ได้ | Must     |
| FR-AUTH-004 | Production ต้องไม่เปิด mock-login endpoint                        | Must     |
| FR-AUTH-005 | ผู้ดูแลต้องดูและยกเลิก active session ได้ตามสิทธิ์                | Should   |

### Master data and members

| ID         | Requirement                                                     | Priority |
| ---------- | --------------------------------------------------------------- | -------- |
| FR-MEM-001 | Staff ต้อง CRUD/archive Student ได้                             | Must     |
| FR-MEM-002 | Staff ต้อง import Student แบบ bulk พร้อม preview ได้            | Should   |
| FR-MEM-003 | ระบบต้อง validate Student ID และ email uniqueness ตาม policy    | Must     |
| FR-MEM-004 | ระบบต้องจัดการ Organization, Placement และ Evaluator assignment | Must     |
| FR-MEM-005 | การลบ master data ที่ถูกอ้างอิงต้องถูกป้องกันหรือ archive       | Must     |

### Competency and evaluation

| ID         | Requirement                                                 | Priority |
| ---------- | ----------------------------------------------------------- | -------- |
| FR-EVL-001 | Staff ต้องสร้างและ version competency set ได้               | Must     |
| FR-EVL-002 | Published competency set ต้อง immutable                     | Must     |
| FR-EVL-003 | Evaluator ต้อง save draft และ resume ได้                    | Must     |
| FR-EVL-004 | ระบบต้องป้องกัน evaluation ซ้ำตาม assignment                | Must     |
| FR-EVL-005 | ระบบต้อง snapshot คำถามและ scoring rule ตอนสร้าง evaluation | Must     |
| FR-EVL-006 | Submit ต้อง validate required field และ score range         | Must     |
| FR-EVL-007 | Reopen ต้องใช้ permission, reason และ audit                 | Must     |
| FR-EVL-008 | Staff ต้อง preview form ตาม Program ได้                     | Should   |

### Correspondence

| ID          | Requirement                                            | Priority |
| ----------- | ------------------------------------------------------ | -------- |
| FR-MAIL-001 | Staff ต้องจัดการ versioned email template ได้          | Must     |
| FR-MAIL-002 | ระบบต้องส่ง invitation/reminder ผ่าน queue             | Must     |
| FR-MAIL-003 | retry ต้องไม่ส่งซ้ำโดยไม่ตั้งใจ                        | Must     |
| FR-MAIL-004 | Staff ต้องเห็น delivery/failed status                  | Must     |
| FR-MAIL-005 | placeholder ที่ไม่รู้จักต้องทำให้ publish/send ไม่ผ่าน | Must     |

### Documents and reports

| ID         | Requirement                                                   | Priority |
| ---------- | ------------------------------------------------------------- | -------- |
| FR-DOC-001 | Staff ต้องสร้าง แก้ preview และ publish document template ได้ | Must     |
| FR-DOC-002 | Published template ต้อง version และ immutable                 | Must     |
| FR-DOC-003 | ระบบต้องสร้าง PDF จาก template/data snapshot                  | Must     |
| FR-DOC-004 | Student ต้องดาวน์โหลดเฉพาะเอกสารตนเอง                         | Must     |
| FR-DOC-005 | PDF ต้องมี checksum และ generation record                     | Must     |
| FR-REP-001 | Dashboard ต้อง filter ตามขอบเขตและแสดง completion ที่ถูกต้อง  | Must     |
| FR-REP-002 | Export ต้องบันทึก audit และ filter metadata                   | Must     |

## 5. Non-functional requirements

### 5.1 Security

- ปฏิบัติตาม OWASP ASVS/Web/API controls ที่องค์กรเลือก
- TLS สำหรับ network traffic ทุกจุดใน Production
- least-privilege DB user และ separate credentials ตาม environment
- encrypt at rest ตาม capability ของ platform
- dependency, SAST, container และ secret scanning ใน CI
- 0 unresolved Critical/High finding ก่อน Production เว้นแต่มี risk acceptance เป็นลายลักษณ์อักษร
- log ต้อง redact secret/token/credential และลด PII

### 5.2 Performance เป้าหมายเสนอ

- API read p95 ไม่เกิน 500 ms ภายใต้ baseline load ที่ตกลง
- API mutation p95 ไม่เกิน 1,000 ms ไม่นับ background job
- list endpoint ใช้ pagination และไม่คืนข้อมูลทั้งหมดโดยไม่จำกัด
- PDF p95 พร้อมดาวน์โหลดไม่เกิน 30 วินาที
- dashboard initial data p95 ไม่เกิน 2 วินาทีภายใต้ baseline dataset

### 5.3 Availability and recovery เป้าหมายเสนอ

- availability อย่างน้อย 99.5% ต่อเดือน ไม่รวม planned maintenance
- backup automated และมี restore drill
- RPO/RTO: `[ต้องยืนยันโดยเจ้าของระบบ]`
- queue job ต้อง recover หลัง worker restart

### 5.4 Accessibility and UX

- core flows เป้าหมาย WCAG 2.2 AA
- responsive ที่ 360 px ขึ้นไป
- keyboard-only ใช้ core flow ได้
- error message ชัดเจนและไม่พึ่งสีอย่างเดียว
- ไทย/อังกฤษไม่ล้นหรือสูญ glyph ใน UI/PDF

### 5.5 Maintainability

- TypeScript strict
- automated test ตาม risk
- OpenAPI contract versioned
- migration และ seed scripts idempotent
- architecture, runbook และ data dictionary อัปเดตพร้อม release

## 6. Data requirements

- data model และ index ตาม `database.md`
- เก็บเวลาเป็น UTC; แสดง Asia/Bangkok ตาม user context
- multilingual field ใช้ `{ th, en }`
- ใช้ soft delete/archive สำหรับข้อมูลที่ต้องเก็บประวัติ
- evaluation/document snapshot ต้อง immutable หลัง finalize
- retention และ deletion policy ต้องอนุมัติก่อน Production
- Production data ห้ามนำไป Development โดยไม่ anonymize

## 7. Integration requirements

| Integration                  | Purpose                 | ข้อมูลที่ต้องยืนยัน                    |
| ---------------------------- | ----------------------- | -------------------------------------- |
| MFU SSO/OIDC                 | Internal authentication | issuer, client, claims, domain, logout |
| Student Information System   | Student/academic sync   | API/file format, owner, frequency      |
| SMTP/Email provider          | Invitation/reminder     | quota, sender domain, bounce webhook   |
| MongoDB Atlas/remote MongoDB | Production database     | region, network, backup, SLA           |
| Object storage               | PDF/image storage       | provider, bucket policy, retention     |
| Monitoring                   | logs/metrics/alerts     | platform and notification channel      |

integration ที่ยังไม่ได้รับข้อมูลต้องใช้ interface/adapter และ test double ห้าม hard-code credential หรือ production endpoint

## 8. Deliverables

1. Source code web, API และ worker
2. Database schemas, indexes, migration/seed scripts
3. OpenAPI specification
4. Automated test suites และ test report
5. Docker/CI/CD configuration
6. Environment variable schema และ secret inventory ที่ไม่รวมค่าจริง
7. Deployment, rollback, backup/restore และ incident runbook
8. Architecture document และ ADRs
9. Data dictionary และ migration mapping
10. User manual สำหรับ Staff, Student และ Evaluator
11. Admin/operations manual
12. UAT scripts และ acceptance report
13. Training session/material ตามข้อตกลง
14. Production handover checklist

## 9. Acceptance tests

### AT-01 Authorization

**Given** Student A login สำเร็จ  
**When** เรียก document หรือ evaluation ของ Student B  
**Then** ระบบปฏิเสธ ไม่เปิดเผยว่าทรัพยากรมีอยู่หรือไม่ตาม policy และบันทึก event

### AT-02 Evaluation uniqueness

**Given** assignment เดียวกันถูก submit แล้ว  
**When** request เดิมถูกส่งพร้อมกันหรือ retry  
**Then** มี evaluation final เพียงหนึ่งรายการและ response สื่อสถานะเดิมอย่างปลอดภัย

### AT-03 Template versioning

**Given** competency/document template version 1 Published แล้ว  
**When** Staff แก้ template  
**Then** ระบบสร้าง Draft version 2 และ version 1 ไม่เปลี่ยน

### AT-04 Email idempotency

**Given** worker timeout หลัง provider รับอีเมล  
**When** job retry  
**Then** ระบบตรวจ idempotency/delivery state และไม่ส่งซ้ำโดยไม่ตั้งใจ

### AT-05 PDF integrity

**Given** evaluation และ document template version ที่กำหนด  
**When** สร้างเอกสารซ้ำจาก snapshot เดียวกัน  
**Then** เนื้อหาเหมือนกันใน field สำคัญและ generation record ระบุ checksum/version

### AT-06 Migration reconciliation

**Given** approved legacy dataset  
**When** migration จบ  
**Then** counts, references, duplicate report และ sampled records ตรงตามเกณฑ์ที่อนุมัติ

### AT-07 Environment isolation

**Given** รัน Development  
**When** application startup  
**Then** เชื่อม `localhost` database และไม่สามารถใช้ Production URI โดยไม่ผ่าน explicit safety override

## 10. Quality gates

- lint/typecheck/build ผ่าน
- unit/integration/E2E core flow ผ่าน
- OpenAPI validation ผ่าน
- database index/integrity tests ผ่าน
- secret scan ไม่พบ credential ใหม่
- dependency/container scan ไม่มี Critical/High ที่ไม่ยอมรับ
- performance baseline ผ่าน
- accessibility core flow ผ่าน
- migration rehearsal และ restore drill ผ่าน
- UAT sign-off ครบผู้มีอำนาจ

## 11. Project governance

### ผู้ว่าจ้าง/เจ้าของระบบ

- อนุมัติ requirement, policy, design, data access และ UAT
- จัดเตรียม subject-matter expert และ integration access
- ตัดสินใจข้อขัดแย้งภายในเวลาที่ตกลง

### ทีมพัฒนา

- ส่งมอบตาม Definition of Done
- รายงาน risk/blocker และ change impact
- ไม่ใช้ production data/secret เกินสิทธิ์
- ดูแล traceability จาก requirement ถึง test

### Change control

- change request ต้องระบุเหตุผล ขอบเขต ผลต่อเวลา/ต้นทุน/risk และ acceptance
- ห้ามเพิ่ม scope แบบไม่บันทึก
- security/legal/compliance change มีสิทธิ์หยุด release

## 12. Training and handover

- training Staff/Admin ตาม role
- sandbox สำหรับฝึกโดยไม่มี Production data
- handover repository, deployment ownership, secret ownership และ monitoring
- knowledge transfer สำหรับ migration, incident และ template maintenance
- ผู้รับมอบต้องสามารถ deploy rollback restore และเพิ่ม academic term ได้

## 13. Warranty, support and SLA

หัวข้อนี้ต้องกรอกก่อนลงนาม:

- ระยะประกัน: `[ระบุ]`
- เวลาบริการ: `[ระบุ]`
- ช่องทางแจ้งเหตุ: `[ระบุ]`
- Severity definition: `[ระบุ]`
- Response/restore target: `[ระบุ]`
- Planned maintenance notice: `[ระบุ]`
- ข้อยกเว้นและ third-party dependency: `[ระบุ]`

## 14. ข้อยกเว้นจากขอบเขต

- mobile native app
- payroll/attendance
- internship marketplace
- AI scoring
- blockchain credential
- integration ที่ไม่มี interface/access จากเจ้าของระบบ
- การรับรองกฎหมายหรือ compliance ที่ยังไม่มี policy จากองค์กร

## 15. เงื่อนไขหยุดหรือยกระดับ

- ไม่ได้รับการยืนยัน data owner หรือ lawful basis สำหรับข้อมูลส่วนบุคคล
- ยังไม่ rotate credential ที่พบใน source ก่อนเริ่ม Production migration
- ไม่มี SSO/integration specification ที่จำเป็นต่อ core flow
- acceptance dataset ไม่พร้อม
- migration พบ data loss/duplicate เกินเกณฑ์
- security gate ไม่ผ่าน
- restore test ไม่สำเร็จ

## 16. เอกสารอ้างอิงภายในชุด V2

- `System.md`
- `Goal.md`
- `Techstack.md`
- `desgin.md`
- `database.md`
