# Goal: Internship Transcript System V2

## 1. วิสัยทัศน์

สร้างระบบกลางที่ทำให้กระบวนการประเมินการฝึกงาน ตั้งแต่เตรียมข้อมูล เชิญผู้ประเมิน รับผล วิเคราะห์ผล ไปจนถึงออก Internship Transcript มีความถูกต้อง ปลอดภัย ตรวจสอบย้อนหลังได้ และใช้งานง่ายสำหรับทุกฝ่าย

## 2. ปัญหาที่ต้องแก้

### ปัญหากระบวนการ

- ข้อมูลนักศึกษา หลักสูตร ผู้ประเมิน และผลประเมินกระจายหลายจุด
- เจ้าหน้าที่ติดตามผู้ที่ยังไม่ประเมินได้ยาก
- การส่งอีเมลและลิงก์ประเมินมีโอกาสผิดคน ซ้ำ หรือหมดอายุโดยไม่มีสถานะชัดเจน
- รูปแบบสมรรถนะเปลี่ยนตามปี/หลักสูตร แต่ระบบเดิมยังควบคุม version ไม่ครบ
- การสร้างรายงานและเอกสารอาศัยข้อมูลหลายส่วนและตรวจความถูกต้องยาก

### ปัญหาเชิงเทคนิคจากระบบเดิม

- README และ stack จริงไม่ตรงกัน
- API ยังไม่มี authentication/authorization ที่บังคับใช้ครบ
- มี mock authentication และ default secret ที่ไม่เหมาะกับ Production
- พบ production credential ในไฟล์ deployment ซึ่งต้อง rotate และนำออกจาก Git history
- data model มีชื่อฟิลด์ไม่สอดคล้อง เช่น `templete` และ `sugestion`
- document status ระหว่าง backend และ frontend ไม่ตรงกัน
- ไม่มี unique constraint ระดับฐานข้อมูลสำหรับผลประเมินหนึ่งชุดต่อผู้รับผิดชอบ
- test coverage ของ business flow ยังไม่เพียงพอ

## 3. Desired outcomes

1. **ข้อมูลชุดเดียวที่เชื่อถือได้**
   - Student, Program, Placement, Evaluator และ Evaluation เชื่อมโยงกันอย่างมี integrity
   - ทุกการแก้ไขสำคัญมี audit trail

2. **กระบวนการประเมินครบวงจร**
   - ตั้งรอบ เลือก competency set มอบหมายผู้ประเมิน ส่ง invitation บันทึกร่าง submit และติดตามผลได้ในระบบเดียว

3. **สิทธิ์และความเป็นส่วนตัวถูกต้อง**
   - ผู้ใช้เห็นเฉพาะข้อมูลตาม role, organization scope และ resource ownership
   - external evaluator เห็นเฉพาะนักศึกษาที่ได้รับมอบหมาย

4. **เอกสารสร้างซ้ำได้และตรวจสอบได้**
   - template มี version
   - PDF ผูกกับ snapshot ของข้อมูลและ template version
   - มี checksum และ generation log

5. **เจ้าหน้าที่เห็นสถานะจริง**
   - dashboard แสดงจำนวนทั้งหมด ประเมินแล้ว ค้าง ส่งไม่สำเร็จ และใกล้ครบกำหนด
   - filter ตาม School, Program, Year, Term และสถานะ

6. **ระบบดูแลต่อได้ง่าย**
   - ใช้ TypeScript, module boundaries, automated tests, OpenAPI และ CI/CD
   - environment Development/Production แยกชัดเจน

## 4. กลุ่มเป้าหมาย

| Persona              | ความต้องการหลัก                   | ผลลัพธ์ที่คาดหวัง                         |
| -------------------- | --------------------------------- | ----------------------------------------- |
| System Admin         | ควบคุมสิทธิ์ config และ audit     | ระบบปลอดภัยและตรวจสอบได้                  |
| Internship Staff     | จัดการข้อมูลและติดตามงานจำนวนมาก  | ลดงานซ้ำและเห็นคิวค้างทันที               |
| Academic Coordinator | วิเคราะห์ผลตามหลักสูตร            | ใช้ข้อมูลวางแผนพัฒนาหลักสูตร              |
| External Evaluator   | ประเมินผ่านลิงก์ที่ง่ายและปลอดภัย | กรอกจบได้บนมือถือ ไม่เห็นข้อมูลเกินจำเป็น |
| Student              | ดูผลและดาวน์โหลดเอกสาร            | ได้เอกสารที่ถูกต้องและเข้าใจผลของตน       |
| Auditor              | ตรวจที่มาและการเปลี่ยนแปลง        | มีหลักฐานครบโดยไม่แก้ข้อมูล               |

## 5. เป้าหมายเชิงผลิตภัณฑ์

### G1: ลดขั้นตอนดำเนินงาน

- นำเข้าหรือ sync ข้อมูลนักศึกษาเป็นชุดได้
- มอบหมาย evaluator และส่ง invitation แบบ bulk ได้
- reminder ทำงานตาม rule โดยไม่ส่งซ้ำ
- เจ้าหน้าที่จัดการ exception จากหน้าคิวเดียว

### G2: เพิ่มอัตราการส่งประเมินครบ

- แสดง deadline และสถานะ invitation ชัดเจน
- รองรับ draft และ resume
- แจ้ง field ที่ยังไม่ครบก่อน submit
- รองรับ reminder ที่กำหนดเวลาได้

### G3: เพิ่มคุณภาพข้อมูล

- validation ทั้ง frontend และ backend
- unique indexes และ referential checks
- competency/template ที่ publish แล้ว immutable
- migration มี reconciliation report

### G4: เพิ่มความปลอดภัย

- ใช้ SSO/OIDC สำหรับผู้ใช้ภายใน
- invitation token hash, one-time use และ expiry
- RBAC + ownership guard ทุก endpoint
- secrets อยู่ใน secret manager
- audit action สำคัญและ data export

### G5: ทำผลประเมินใช้ประโยชน์ได้

- dashboard แสดง distribution และ completion
- เปรียบเทียบตาม School/Program/Year โดยคำนึงถึงสิทธิ์
- export CSV/XLSX/PDF แบบมี metadata และเวลาอ้างอิง
- transcript แสดง competency และข้อเสนอแนะที่เผยแพร่ได้

## 6. ตัวชี้วัดความสำเร็จ

ค่าด้านล่างเป็น **เป้าหมายเสนอ** ต้องยืนยันกับเจ้าของโครงการก่อนใช้เป็น SLA หรือเงื่อนไขสัญญา

| ตัวชี้วัด                   | วิธีวัด                                      | เป้าหมายเสนอ                 |
| --------------------------- | -------------------------------------------- | ---------------------------- |
| Evaluation completion rate  | submitted / assigned ภายใน deadline          | อย่างน้อย 95%                |
| Invitation delivery success | delivered / attempted ไม่รวมอีเมลผิด         | อย่างน้อย 98%                |
| Duplicate submission        | evaluation ซ้ำต่อ assignment                 | 0 รายการ                     |
| Dashboard accuracy          | เทียบ aggregate กับชุดข้อมูลอ้างอิง          | 100% ใน acceptance dataset   |
| API latency                 | p95 ของ read endpoint ภายใต้ baseline load   | ไม่เกิน 500 ms               |
| Page interaction            | p75 ของ core page หลังโหลด                   | ไม่เกิน 2 วินาที             |
| PDF generation              | p95 จาก request ถึงพร้อมดาวน์โหลด            | ไม่เกิน 30 วินาที            |
| Availability                | uptime รายเดือน ไม่รวม maintenance ที่ประกาศ | อย่างน้อย 99.5%              |
| Accessibility               | automated + manual audit                     | WCAG 2.2 AA สำหรับ core flow |
| Security                    | unresolved finding ก่อน release              | 0 Critical และ 0 High        |
| Recovery                    | restore จาก backup ตาม drill                 | สำเร็จตาม RPO/RTO ที่อนุมัติ |

## 7. ขอบเขตแบบ MoSCoW

### Must have

- SSO/OIDC สำหรับผู้ใช้ภายใน และ secure invitation สำหรับ evaluator
- RBAC และ resource ownership
- Academic master data
- Student, Organization, Placement และ Evaluator assignment
- Versioned competency sets
- Evaluation draft/submit/lock/reopen workflow
- Email template, invitation, reminder และ delivery status
- Admin dashboard และ student dashboard
- Versioned document template และ PDF generation
- Audit log, OpenAPI, validation, pagination และ export
- Development/Production environment แยกกัน
- migration จาก collection เดิมที่อยู่ในขอบเขต

### Should have

- bulk import พร้อม validation preview
- queue dashboard และ retry failed job
- signed download URL และ file checksum
- configurable notification schedule
- bilingual content ไทย/อังกฤษ
- responsive evaluator form
- report ตาม School/Program/Year/Term

### Could have

- in-app notification แบบ realtime
- approval workflow ก่อน publish document template
- webhook เชื่อมระบบมหาวิทยาลัย
- advanced analytics และ cohort comparison
- digital signature หรือ verification QR

### Won't have ใน release แรก

- mobile native application
- microservices เต็มรูปแบบ
- AI ให้คะแนนหรือสรุปผู้ประเมินอัตโนมัติ
- blockchain credential
- payroll, attendance หรือ internship marketplace
- แก้ข้อมูลระบบต้นทางของมหาวิทยาลัยจาก V2 โดยตรง

## 8. Milestones แบบไม่มีวันที่ผูกมัด

### Phase 0: Discovery and approval

- ยืนยัน workflow, roles, data owner และ policy
- inventory ข้อมูลจริงและ integration
- อนุมัติ TOR, schema และ acceptance dataset

### Phase 1: Foundation

- repository, environments, CI/CD และ observability
- authentication, RBAC, audit และ error contract
- academic/member master data

### Phase 2: Evaluation core

- competency versioning
- cycle/assignment/invitation
- evaluator form, draft และ submit
- completion dashboard

### Phase 3: Correspondence and documents

- email queue, template และ reminder
- document editor migration
- server-side PDF generation และ download

### Phase 4: Migration and hardening

- dry-run migration
- performance, security, accessibility และ recovery test
- UAT และ training

### Phase 5: Go-live and stabilization

- production cutover
- reconciliation
- monitoring และ incident support

## 9. Acceptance outcomes

### Scenario A: ผู้ประเมินส่งแบบประเมิน

**Given** มี assignment ที่ active และ invitation ยังไม่หมดอายุ  
**When** ผู้ประเมินกรอกข้อมูลบังคับครบและกด Submit  
**Then** ระบบบันทึก evaluation หนึ่งรายการ ล็อก submission บันทึก audit และ dashboard สะท้อนผล

### Scenario B: ป้องกันการเข้าถึงข้ามคน

**Given** ผู้ประเมิน A ได้รับมอบหมายนักศึกษา A  
**When** ผู้ประเมิน A เรียกข้อมูล assignment ของนักศึกษา B  
**Then** ระบบตอบ 403 หรือ 404 ตาม security policy และบันทึก security event

### Scenario C: สร้าง Transcript

**Given** นักศึกษามีผลประเมินที่เผยแพร่และมี document template version ที่ active  
**When** นักศึกษาขอสร้าง PDF  
**Then** ระบบสร้างเอกสารจาก snapshot ที่ถูกต้อง บันทึก checksum และให้ signed URL ที่หมดอายุ

### Scenario D: ป้องกันการส่งอีเมลซ้ำ

**Given** invitation job เดิมถูก retry จาก timeout  
**When** worker ประมวลผลงานเดิมอีกครั้ง  
**Then** idempotency key ป้องกันการสร้าง invitation หรือส่งอีเมลซ้ำโดยไม่ตั้งใจ

## 10. Definition of Done ของ release

- Requirement และ acceptance test ที่อยู่ใน release ผ่านทั้งหมด
- UAT ได้รับการยืนยันจากตัวแทน Staff, Coordinator, Student และ Evaluator
- migration reconciliation ไม่มี record สูญหายหรือซ้ำเกินเกณฑ์ที่อนุมัติ
- security, performance และ accessibility gate ผ่าน
- runbook deployment, rollback, backup, restore และ incident พร้อมใช้
- training material และ data dictionary ส่งมอบ
- owner ของระบบรับทราบข้อจำกัดที่ยังเหลือ

## 11. สมมติฐานและเรื่องที่ต้องยืนยัน

- SSO provider และ domain policy ของ MFU
- ผู้มีอำนาจดูผลรายบุคคลและเวลาที่นักศึกษาเริ่มเห็นผล
- scale คะแนนและคำถามบังคับ
- evaluator หนึ่งคนประเมินนักศึกษาหลายคนได้หรือไม่
- หนึ่ง placement มี evaluator หลายคนและต้อง aggregate อย่างไร
- อายุ invitation, reminder schedule และ reopen policy
- retention period ของข้อมูลส่วนบุคคล ผลประเมิน audit และ PDF
- RPO/RTO ที่องค์กรยอมรับ
- รูปแบบ transcript/certificate อย่างเป็นทางการและผู้อนุมัติ template
- ขอบเขตข้อมูลที่จะ migrate จากระบบเดิม
