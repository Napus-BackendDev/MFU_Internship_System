# Design Specification: Internship Transcript System V2

> ชื่อไฟล์ `desgin.md` รักษาตามคำขอ เนื้อหาเป็นข้อกำหนด UX/UI และ design system สำหรับ V2
>
> เอกสารนี้เป็นแหล่งอ้างอิง information architecture, routes และ screen intent ส่วน design tokens, component contracts, UX patterns และ quality gates ฉบับ canonical อยู่ที่ [`docs/design/DESIGN_SYSTEM.md`](docs/design/DESIGN_SYSTEM.md)

## 1. Design objectives

1. ทำให้งานประเมินจบได้โดยไม่ต้องเรียนรู้ระบบมาก
2. ทำให้เจ้าหน้าที่มองเห็นสถานะและ exception ก่อนรายละเอียดเชิงลึก
3. แยกสิทธิ์และบริบทของ Admin, Staff, Student และ Evaluator ชัดเจน
4. รองรับภาษาไทย/อังกฤษและหน้าจอมือถือ
5. ลดความผิดพลาดจากการ submit, bulk send, publish และ delete
6. ทำให้ข้อมูลคะแนนและสถานะเข้าใจได้แม้ไม่เห็นสีหรือกราฟ
7. รักษาภาพลักษณ์ MFU แบบเป็นทางการแต่ไม่ใช้ UI หนาแน่นแบบ admin template เก่า

## 2. หลักการออกแบบ

- **Task first:** หน้าแรกของแต่ละ role แสดงงานที่ต้องทำก่อนเมนูรอง
- **Progressive disclosure:** แสดงข้อมูลจำเป็นก่อน รายละเอียดขั้นสูงอยู่ใน drawer/modal/secondary page
- **Safe by default:** action สำคัญมี preview, validation และ confirmation ตามระดับผลกระทบ
- **Consistent status:** status ใช้คำ สี icon และลำดับเดียวทั่วระบบ
- **Accessible:** keyboard, focus, contrast, semantic labels และ text alternative
- **Bilingual by design:** ไม่แปลภายหลัง; component ต้องรับข้อความไทยที่ยาวกว่าอังกฤษ
- **Auditability:** ผู้ใช้เห็นว่าใครแก้ เมื่อใด และ version ใดในหน้าที่เกี่ยวข้อง

## 3. Information architecture

### 3.1 Staff/Admin navigation

```text
Overview
├─ Dashboard
├─ Action Queue
Evaluation Operations
├─ Cycles
├─ Assignments
├─ Invitations & Reminders
├─ Evaluations
People & Organizations
├─ Students
├─ Evaluators
├─ Organizations
Academic Setup
├─ Schools
├─ Programs
├─ Courses
├─ Terms
Content
├─ Competency Sets
├─ Email Templates
├─ Document Templates
Reports
├─ Completion
├─ Competency Analytics
├─ Exports
Administration
├─ Users & Roles
├─ Audit Log
├─ Integrations
├─ System Health
```

### 3.2 Student navigation

```text
My Internship
├─ Overview
├─ Evaluation Results
├─ Documents
└─ Profile / Data Correction Request
```

### 3.3 External evaluator navigation

Evaluator ไม่ควรเห็น admin shell เต็มรูปแบบ ใช้ focused flow:

```text
Invitation validation
→ Student summary
→ Evaluation form
→ Review
→ Submit confirmation
→ Receipt
```

## 4. Route proposal

| Route                       | Screen                      | Role                    |
| --------------------------- | --------------------------- | ----------------------- |
| `/login`                    | SSO login/fallback message  | Internal user           |
| `/admin/dashboard`          | Operational overview        | Admin/Staff/Coordinator |
| `/admin/action-queue`       | Overdue/failed/missing data | Staff                   |
| `/admin/cycles`             | Evaluation cycles           | Staff                   |
| `/admin/cycles/:id`         | Cycle workspace             | Staff/Coordinator       |
| `/admin/students`           | Student directory           | Staff                   |
| `/admin/evaluators`         | Evaluator directory         | Staff                   |
| `/admin/competency-sets`    | Competency versions         | Staff                   |
| `/admin/email-templates`    | Email templates             | Staff                   |
| `/admin/document-templates` | Document templates          | Staff                   |
| `/admin/reports`            | Reports and export          | Staff/Coordinator       |
| `/admin/audit`              | Audit log                   | System Admin/Auditor    |
| `/evaluate/:token`          | Secure evaluator flow       | External evaluator      |
| `/student`                  | Student overview            | Student                 |
| `/student/results`          | Competency results          | Student                 |
| `/student/documents`        | Generated documents         | Student                 |

## 5. Visual identity

### 5.1 Color tokens

ใช้ Verdana Health Design System ที่เจ้าของโปรเจกต์ส่งมอบเป็นทิศทางหลัก โดยปรับบริบทจาก Health UI เป็นระบบงานมหาวิทยาลัย แต่คงบุคลิกที่สงบ น่าเชื่อถือ อ่านง่าย และใช้พื้นที่ว่างอย่างเหมาะสม

```css
:root {
  --color-primary-navy: #0f172a;
  --color-primary-hover: #020617;
  --color-secondary-slate: #64748b;
  --color-tertiary-sage: #059669;
  --color-interactive-sage: #047857;

  --color-neutral-600: #475569;
  --color-neutral-300: #cbd5e1;
  --color-neutral-200: #e2e8f0;
  --color-neutral-100: #f1f5f9;
  --color-surface: #ffffff;
  --color-page: #f8fafc;

  --color-success: #22c55e;
  --color-warning: #eab308;
  --color-danger: #ef4444;
  --color-info: #0ea5e9;
}
```

ห้ามใช้สีเป็นข้อมูลเพียงอย่างเดียว Status ต้องมี label และ icon

### 5.2 Typography

- Heading: `Plus Jakarta Sans`
- Body: `DM Sans`
- Technical/tabular data: `Fira Code`
- Thai fallback: `Noto Sans Thai`
- PDF ต้อง bundle font และตรวจ license
- Body desktop: 16 px, line-height 1.6
- Body dense table: ไม่ต่ำกว่า 14 px
- Display: 40/46, H1: 32/38, H2: 24/30, H3: 20/26
- Label: 14/20, weight 500
- Helper/error: 13-14 px แต่ contrast ต้องผ่าน

### 5.3 Spacing and geometry

- Base spacing: 8 px และใช้ 4 px เป็น half-step
- Common spacing: 4, 8, 16, 24, 32, 48, 64
- Page max width: 1440 px; content forms 720-960 px
- Card/input/button radius: 8 px
- Modal/dropdown radius: 12 px
- Input/button minimum height: 44 px
- Touch target: อย่างน้อย 44 x 44 px
- Table row: 48-56 px ตาม density
- Sidebar desktop: 256 px; collapsed icon rail 72 px

### 5.4 Elevation

- Default card ใช้พื้นขาว ขอบ Slate 200 และไม่มี shadow
- ใช้ diffused shadow ของ Navy 3–10% เฉพาะ floating layer, modal, dropdown และ selected canvas object
- ห้ามใช้ heavy shadow, gradient, neon และ glassmorphism

## 6. Layout system

### Desktop admin

```text
┌──────────────┬─────────────────────────────────────────┐
│ Sidebar      │ Header: title / context / user          │
│              ├─────────────────────────────────────────┤
│ Main nav     │ Breadcrumb / page actions               │
│              ├─────────────────────────────────────────┤
│              │ Filters / KPI / content / pagination    │
└──────────────┴─────────────────────────────────────────┘
```

### Mobile evaluator

```text
┌──────────────────────────┐
│ MFU + secure session     │
├──────────────────────────┤
│ Student summary          │
├──────────────────────────┤
│ Section progress 2/4     │
├──────────────────────────┤
│ One competency group     │
│ Rating controls          │
│ Comment field            │
├──────────────────────────┤
│ Save draft   Continue    │
└──────────────────────────┘
```

## 7. Shared components

ใช้ Nuxt UI เป็นฐานของ shared component ทั้งระบบ แล้วปรับสี typography radius spacing และสถานะผ่าน `app.config.ts`/design tokens ส่วน component เฉพาะ domain ให้ประกอบจาก Nuxt UI โดยคง accessibility และ interaction contract เดิม

### Application shell

- role-aware sidebar
- top bar: current context, language, help, user menu
- environment banner สำหรับ non-production
- breadcrumb ไม่เกิน 3 ระดับที่มองเห็น

### Status badge

Standard labels:

- Draft
- Scheduled
- Open
- In progress
- Submitted
- Overdue
- Failed
- Published
- Retired
- Archived

Badge มี icon + text + accessible label สีเป็นข้อมูลเสริม

### Data table

- server-side filter/sort/pagination
- sticky header เมื่อข้อมูลยาว
- selection แสดงจำนวนที่เลือก
- bulk action อยู่ใน contextual toolbar
- column chooser เฉพาะหน้าที่ซับซ้อน
- mobile เปลี่ยนเป็น list card หรือ horizontal scroll ที่แจ้งชัด
- empty state แยก “ไม่มีข้อมูล” กับ “ไม่พบจาก filter”

### Filter bar

- search debounce
- filter สำคัญแสดงตรงหน้า
- filter รองใน drawer
- active filter chips และ Clear all
- URL เก็บ filter สำหรับแชร์/ย้อนกลับ

### Forms

- label อยู่เหนือ input
- required ระบุทั้งข้อความและ semantic attribute
- validate หลัง blur/submit ไม่แสดง error ก่อนผู้ใช้โต้ตอบโดยไม่จำเป็น
- error บอกวิธีแก้ ไม่ใช้เพียง “Invalid”
- unsaved changes warning
- destructive action ต้องพิมพ์ยืนยันเฉพาะกรณีผลกระทบสูง

### Dialogs and notifications

- toast สำหรับผลสำเร็จที่ไม่ต้องตัดสินใจ
- inline alert สำหรับ error ที่แก้ในบริบท
- modal สำหรับ confirmation สั้น
- full page/drawer สำหรับ workflow ยาว
- error ต้องมี request ID เมื่อควรส่งต่อ support

## 8. Screen specifications

### 8.1 Admin Dashboard

ลำดับข้อมูล:

1. Context: Term, School, Program
2. KPI cards: Assigned, Submitted, Pending, Overdue, Failed delivery
3. Completion trend
4. Status breakdown พร้อมตารางทดแทนกราฟ
5. Action queue
6. Recent activities

KPI card click แล้ว filter รายการตามสถานะ ไม่ควรเป็นตัวเลขที่กดไม่ได้

### 8.2 Action Queue

รวมรายการที่ต้องดำเนินการ:

- student ไม่มี placement
- assignment ไม่มี evaluator
- invitation ส่งไม่สำเร็จ
- overdue evaluation
- PDF generation failed
- migration/quarantine issue

แต่ละรายการมี severity, owner, due date, recommended action และ audit link

### 8.3 Students

- search Student ID, name, email
- filter School, Program, Term, Placement, Evaluation status
- columns: Student, Academic, Placement, Evaluator, Evaluation, Updated
- row action: View, Edit, Assign, Send reminder, Generate document
- bulk import มีขั้นตอน Upload → Map columns → Validate → Preview → Commit → Report

### 8.4 Evaluators and organizations

- Organization เป็น entity หลัก ไม่เก็บชื่อบริษัทซ้ำใน Student
- Evaluator profile แสดง assignments และ delivery history
- อีเมลผิด/ตีกลับต้องเห็นชัด
- ห้ามแสดงข้อมูลนักศึกษานอก assignment

### 8.5 Competency Set Builder

- หน้า list แสดง name, target Program, version, status, effective term, updated by
- editor แบ่ง General, Program-specific, Suggestions
- criteria มี bilingual label/question, scale, weight, required, order
- preview desktop/mobile
- publish dialog สรุปผลกระทบและจำนวน future assignments
- published version read-only พร้อม “Create new version”

### 8.6 Evaluation Form

- header แสดง student identity เท่าที่จำเป็นและ deadline
- progress bar/section stepper
- แต่ละ criteria แสดง question, helper และ rating legend
- rating ต้องมี label ทุกค่า เช่น 1 = Needs improvement, 5 = Excellent
- save status: Saving, Saved at HH:mm, Offline/Failed
- review page สรุป unanswered/low confidence ก่อน submit
- submit confirmation ระบุว่าแก้ไม่ได้หลังส่ง
- receipt แสดง reference ID และเวลา โดยไม่เปิดข้อมูลลับ

### 8.7 Correspondence

- tabs: Campaigns, Templates, Delivery logs
- template editor แยก Subject/Body
- placeholder picker ไม่ให้พิมพ์ชื่อผิด
- preview ด้วย selected student/evaluator หรือ safe sample
- test email ส่งได้เฉพาะ address ที่อนุญาตใน non-production
- bulk send summary: target, excluded, duplicate, invalid, scheduled

### 8.8 Document Templates

- list: title, type, version, status, last published, owner
- editor 3-column:
  - ซ้าย: elements/data/graphs
  - กลาง: A4 canvas
  - ขวา: properties/layers/version info
- top toolbar: undo, redo, zoom, preview, validate, save draft, publish
- auto-save draft พร้อม explicit save state
- validation panel: unknown placeholder, overflow risk, missing font/image
- preview ใช้ sample dataset แบบสั้น/ยาวเพื่อทดสอบ overflow
- published template เปิดแบบ read-only

### 8.9 Student Dashboard

- profile summary
- evaluation status และ visibility notice
- soft/hard skill summary พร้อมคำอธิบาย scale
- feedback แยก strengths และ growth opportunities ตาม policy
- documents list แสดง type, generatedAt, template version และ download expiry
- data correction request ไม่แก้ master data โดยตรง

### 8.10 Reports

- report builder ใช้ filter ที่จำกัดตาม permission
- preview totals ก่อน export
- export job แสดง progress
- ไฟล์มี generatedAt, timezone, filters และ data classification
- กราฟมี accessible table

### 8.11 Audit Log

- filters: actor, action, resource, result, date, request ID
- detail แสดง before/after เฉพาะ field ที่อนุญาตและ redact secret
- export audit จำกัด role และต้อง audit การ export อีกชั้น

## 9. Responsive behavior

| Breakpoint    | Behavior                                                       |
| ------------- | -------------------------------------------------------------- |
| `< 576 px`    | single column, bottom/sticky primary action, tables เป็น cards |
| `576-767 px`  | compact filters, drawer navigation                             |
| `768-1199 px` | collapsible sidebar, 2-column cards                            |
| `>= 1200 px`  | full sidebar, multi-column dashboard                           |

Document editor ขั้นสูงอาจกำหนด minimum viewport และเสนอ read-only preview บนมือถือ แต่ evaluator form และ student document download ต้องใช้มือถือได้เต็มรูปแบบ

## 10. Accessibility requirements

- semantic HTML landmarks และ heading order
- skip-to-content
- visible focus ไม่ถูก CSS ลบ
- modal trap focus และคืน focus เมื่อปิด
- input มี label, description, error association
- rating control ใช้ radio group หรือ equivalent semantic
- contrast: normal text อย่างน้อย 4.5:1, large text 3:1
- animation เคารพ `prefers-reduced-motion`
- chart มี summary/table
- PDF ตรวจ tag/accessibility ตามข้อกำหนดที่องค์กรอนุมัติ
- ภาษาใน element กำหนด `lang="th"`/`lang="en"`

## 11. Localization and content style

- ใช้คำเดียวกันทั้งระบบ เช่น “ผู้ประเมิน / Evaluator” ไม่สลับ Adviser/Advisor โดยไม่มี definition
- “Program” แปลตามคำที่ MFU รับรอง เช่น หลักสูตร/สาขาวิชา
- วันที่แสดงรูปแบบ locale แต่ tooltip ให้ ISO เมื่อจำเป็น
- error ไทย/อังกฤษต้องบอกสิ่งที่เกิดและวิธีแก้
- หลีกเลี่ยง technical code ต่อผู้ใช้ทั่วไป ยกเว้น request ID
- ไม่ฝังข้อความใน component หากควรอยู่ใน translation catalog

## 12. Interaction safety

| Action            | Protection                                 |
| ----------------- | ------------------------------------------ |
| Save draft        | auto-save + state indicator                |
| Submit evaluation | review + confirmation + idempotency        |
| Publish template  | validation + impact summary + confirmation |
| Bulk send         | recipient preview + duplicate suppression  |
| Archive record    | dependency summary + reason                |
| Reopen evaluation | permission + reason + audit                |
| Export PII        | scope summary + audit + expiry             |
| Change role       | before/after + confirmation + audit        |

## 13. Loading, empty and error states

ทุก data screen ต้องออกแบบอย่างน้อย 5 สถานะ:

1. initial loading — skeleton ที่ใกล้ layout จริง
2. empty — ยังไม่มี record พร้อม primary action
3. filtered empty — ไม่พบผล พร้อม Clear filters
4. recoverable error — Retry และ request ID
5. permission denied — อธิบายสิทธิ์โดยไม่เปิดข้อมูลเกินจำเป็น

ใช้ optimistic update เฉพาะ action ที่ rollback ง่าย ห้ามใช้กับ submit evaluation, publish, role change หรือ bulk send

## 14. Design QA checklist

- [ ] navigation ตรงกับ role matrix
- [ ] ไม่มี action ที่ frontend ซ่อนอย่างเดียวโดย backend ไม่ป้องกัน
- [ ] core flow ใช้ keyboard ได้
- [ ] responsive ที่ 360, 768, 1024 และ 1440 px
- [ ] ไทย/อังกฤษไม่ล้น
- [ ] status มี text/icon ไม่พึ่งสี
- [ ] empty/loading/error/permission state ครบ
- [ ] destructive/publish/submit action มี protection เหมาะสม
- [ ] evaluator form จบได้บนมือถือ
- [ ] table ใช้ pagination และ filter server-side
- [ ] graph มี text/table alternative
- [ ] document template ทดสอบข้อมูลสั้นและยาว
- [ ] PDF font ไทยถูกต้อง
- [ ] accessibility audit ผ่าน core pages

## 15. Prototype and usability test

ทดสอบอย่างน้อยกับ persona ต่อไปนี้:

- Staff ที่จัดการนักศึกษาเป็นชุด
- Coordinator ที่ดูเฉพาะ Program
- External evaluator ที่ใช้มือถือ
- Student ที่ดาวน์โหลดเอกสาร
- System Admin ที่ตรวจ audit/failed jobs

งานทดสอบหลัก:

1. หา overdue evaluation และส่ง reminder
2. import students แล้วแก้ invalid rows
3. สร้าง/publish competency version ใหม่
4. evaluator บันทึกร่างและ submit
5. student ดูผลและดาวน์โหลด PDF
6. staff ตรวจ email/PDF failure

เก็บ completion rate, task time, error, help request และ qualitative feedback โดยไม่บันทึกข้อมูลส่วนบุคคลเกินจำเป็น
