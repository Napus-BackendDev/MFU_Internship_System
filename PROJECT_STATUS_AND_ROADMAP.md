# สรุปภาพรวมโครงการ ระบบบริหารจัดการและออกทรานสคริปต์การฝึกงาน มหาวิทยาลัยแม่ฟ้าหลวง (Internship Transcript System V2)

**เอกสารสรุปสถานะการพัฒนา สิ่งที่ทำเสร็จแล้ว สิ่งที่ค้างอยู่ และหมุดหมาย/จุดประสงค์ถัดไป (Project Status & Roadmap)**

---

## 1. บทนำและบริบทของโครงการ (Project Context)

โครงการ **Internship Transcript System V2** เป็นระบบระดับ Production สำหรับบริหารจัดการข้อมูลการฝึกงานของนักศึกษามหาวิทยาลัยแม่ฟ้าหลวง ครอบคลุมตั้งแต่:

- การจัดเก็บข้อมูลสถานศึกษา/หลักสูตร (Academic Schools & Programs)
- การจับคู่สถานที่ฝึกงานและพี่เลี้ยงสถานประกอบการ (Placements & Evaluators)
- ระบบส่งแบบประเมินสมรรถนะผ่านรหัส PIN 16 หลัก และระบบทำแบบประเมินออนไลน์
- การประมวลผลสมรรถนะนักศึกษา (Soft Skills & Hard Skills)
- การแสดงผลแดชบอร์ดเปรียบเทียบกับนักศึกษารุ่นปีเดียวกัน (Cohort Benchmarking)
- การออกเอกสารราชการแบบไดนามิก (หนังสือส่งตัว และ ใบรับรองการฝึกงานพร้อมพิมพ์/ดาวน์โหลด)
- การส่งออกข้อมูลเพื่อวิเคราะห์ต่อด้วย Microsoft Power BI

---

## 2. สิ่งที่ได้ทำลงไปแล้วทั้งหมด (Completed Features & Milestones)

### 2.1 โครงสร้างระบบพื้นฐาน (Core Architecture & Monorepo)

- **Monorepo Architecture (pnpm Workspace)**:
  - `apps/web`: Nuxt 4 (Vue 3, Nuxt UI, Pinia, TypeScript)
  - `apps/api`: NestJS (Fastify/Express, Mongoose/MongoDB, Default-Deny RBAC)
  - `apps/worker`: BullMQ Worker สำหรับประมวลผลงานเบื้องหลัง (Background Jobs เช่น ส่งอีเมล และ Render PDF)
  - `packages/`: `config`, `shared-types`, `validation`, `api-client`, `design-tokens`
- **Design System (Verdana Health Theme)**:
  - ใช้โทนสี Navy / Sage และ Emerald ตามข้อกำหนด
  - Typography แบบ Self-hosted (Noto Sans Thai, Plus Jakarta Sans, DM Sans, Fira Code)
  - รองรับ Dark / Light Mode สมบูรณ์

### 2.2 การปรับปรุง UI แดชบอร์ดตามความต้องการของผู้ใช้ (Dashboard Refinements)

- **ทำความสะอาดหน้า Dashboard ให้กระชับและตรงจุด**:
  - ตัดการแสดงผลตัวนับ pagination ซ้ำซ้อน (`แสดงผล 71 จากทั้งหมด 71 คน...`) ในตัวกรอง
  - นำการ์ดสถิติตัวเลขด้านบนที่รบกวนสายตาออก (`นักศึกษาทั้งหมด 71, รอประเมิน 1...`)
  - นำแบนเนอร์/ปุ่ม Setup Wizard สำหรับเจ้าหน้าที่ออกตามคำขอ
  - นำปุ่ม Word (.docx) ออกจากระบบ เพื่อคงไว้เฉพาะเอกสารทางการตามมาตรฐาน PDF/Print
- **ระบบส่งออกข้อมูลสำหรับ Power BI (Power BI Direct Export)**:
  - เพิ่มปุ่มและเมนู Dropdown ในหน้าตารางนักศึกษา (`AdminStudentDirectory.vue`)
  - รองรับการ Export ทั้งไฟล์ `.csv` (พร้อม UTF-8 BOM สำหรับเปิดใน Excel/Power BI ภาษาไทยไม่เพี้ยน) และ `.xlsx` (Excel Workbook)
  - โครงสร้างข้อมูลเป็น Dimensional Schema รองรับการสร้าง Data Model และ Relation ใน Power BI Desktop ทันที

### 2.3 เอกสารทางราชการแบบไดนามิกและการพิมพ์ (Dynamic Document Generator & Print View)

- **หนังสือรับรองการฝึกงาน (Certificate of Internship Completion)** และ **หนังสือส่งตัวนักศึกษา (Official Referral Letter)**:
  - ออกแบบเทมเพลตเป็นระบบไดนามิก 100% เชื่อมโยงตามข้อมูลนักศึกษาที่ล็อกอินจริง (รหัสนักศึกษา, ชื่อ-นามสกุล ไทย/อังกฤษ, สำนักวิชา, หลักสูตร, บริษัท/หน่วยงาน, ระยะเวลาฝึกงาน, ชื่อคณบดีตามสำนักวิชา, ชื่อผู้ประเมิน)
  - ปรับปรุงโมดอลแสดงตัวอย่างพร้อมรองรับ `window.print()` ด้วย Print Stylesheet แบบเฉพาะ (A4 Letterhead, ลายเซ็นทางการ, ตราสัญลักษณ์) ที่พิมพ์หรือบันทึกเป็น PDF ได้ทันที

### 2.4 ระบบวิเคราะห์สมรรถนะและ Benchmark กราฟ (Cohort Benchmark & Skills Visualization)

- **คอมโพเนนต์ `StudentSkillBenchmarkChart.vue`**:
  - กราฟ **SVG Radar Chart** แสดงสมรรถนะแบบใยแมงมุม วิเคราะห์จุดเด่นของนักศึกษา
  - กราฟ **Comparative Progress Bars** เปรียบเทียบสมรรถนะแต่ละข้อระหว่าง "คะแนนของนักศึกษา" กับ "ค่าเฉลี่ยรุ่นปีเดียวกัน (ปีการศึกษา 2569)"
  - คำนวณเปอร์เซ็นต์ส่วนต่างอัตโนมัติ (เช่น `+18% เหนือกว่าค่าเฉลี่ยรุ่น`) พร้อมสรุปสถานะอันดับ Top 5% ของรุ่น
  - แท็บตัวกรองเพื่อสลับดู: ทั้งหมด (All), ทักษะทั่วไป (Soft Skills), และทักษะวิชาชีพ (Hard Skills)

### 2.5 การจำแนกรายละเอียด Sub-sections ของทักษะ Soft Skills และ Hard Skills (ล่าสุด)

- **หมวด 1: Soft Skills (อิงจากแบบฟอร์มประเมินจริงที่พี่เลี้ยงทำส่งมา)**:
  - แยกเป็น 6 ทักษะย่อยตามฟอร์มมาตรฐาน มฟล.:
    1. _ความตรงต่อเวลาและการปฏิบัติตามกฎระเบียบขององค์กร (Punctuality & Regulations)_ — ดึงคะแนนตรงจากฟิลด์ `punctuality` ของฟอร์ม
    2. _การทำงานร่วมกับผู้อื่นและการสื่อสารในทีม (Teamwork & Communication)_ — ดึงคะแนนตรงจากฟิลด์ `teamwork` ของฟอร์ม
    3. _ความรับผิดชอบต่องานและความกระตือรือร้น (Responsibility & Initiative)_ — ดึงคะแนนตรงจากฟิลด์ `responsibility` ของฟอร์ม
    4. _การคิดวิเคราะห์และการแก้ปัญหาเฉพาะหน้า (Problem Solving & Critical Thinking)_
    5. _การเรียนรู้และความคิดริเริ่มสร้างสรรค์ (Initiative & Fast Learning)_
    6. _คุณธรรม จริยธรรม และจรรยาบรรณวิชาชีพ (Ethics & Professional Integrity)_
  - แสดง Progress Bar เทียบกับคะแนนเต็ม 5.0 และค่าเฉลี่ยรุ่นปี 2569
  - มี Criteria Checklist ข้อย่อย 3 ข้อ, แท็กทักษะ, และ Evaluator Feedback เฉพาะด้าน
- **หมวด 2: Hard Skills (รายละเอียดสมรรถนะวิชาชีพเฉพาะทาง)**:
  - เพิ่ม 6 ทักษะย่อยเพื่อเช็ค UI และ Mockup Data ครอบคลุมสายงานวิศวกรรม/ซอฟต์แวร์:
    1. _Software Engineering & Architecture_
    2. _Database & Data Engineering_
    3. _QA & Automated Testing_
    4. _Cloud Infrastructure & DevOps_
    5. _System Analysis & Troubleshooting_
    6. _Engineering Tools & Agile Workflow_

---

## 3. สิ่งที่เหลืออยู่และต้องทำต่อ (Pending Tasks & Next Steps)

| รายการงาน                                                           | รายละเอียด                                                                                                                                                              |  ลำดับความสำคัญ   |
| :------------------------------------------------------------------ | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :---------------: |
| **1. ระบบเชื่อมต่อ MFU Central OIDC / SSO**                         | กำหนดค่า Issuer, Client Secret, Role Claim Mapping จากระบบส่วนกลางของมหาวิทยาลัยแม่ฟ้าหลวง เพื่อใช้แทนโหมด Development Auth                                             | **P0 (Critical)** |
| **2. กำหนดนโยบายและสูตรคำนวณคะแนนรวม (Scoring Aggregation Policy)** | ปัจจุบัน Aggregate Score ในระดับ Database ถูกเว้นเป็น `null` ตามสเปก ต้องกำหนดสูตรถ่วงน้ำหนัก (Weighting) ระหว่าง Soft Skills และ Hard Skills ตามเกณฑ์ของแต่ละสำนักวิชา |   **P1 (High)**   |
| **3. นโยบายการขอเปิดฟอร์มประเมินซ้ำ (Evaluation Reopen Policy)**    | กำหนดเงื่อนไขว่ากรณีใดที่อนุญาตให้เปิดฟอร์มประเมินซ้ำได้ (สิทธิ์ผู้ที่กด Reopen ได้, กรอบเวลาที่อนุญาต, การบันทึก Audit Log)                                            |   **P1 (High)**   |
| **4. การนำเข้าข้อมูลนักศึกษาแบบกลุ่ม (Bulk Student Import)**        | รองรับการอัปโหลดไฟล์ Excel/CSV รายชื่อนักศึกษาจำนวนมาก พร้อมหน้าจอ Preview ตรวจสอบความถูกต้องและแจ้งเตือนข้อมูลซ้ำก่อน Commit ลงฐานข้อมูล                               |   **P1 (High)**   |
| **5. ระบบคิวออกเอกสารและจัดเก็บ S3 ในระดับ Production**             | เชื่อมต่อ MinIO / AWS S3 จริง พร้อมตั้งค่า Worker รันแปลงเอกสารเป็นไฟล์ PDF ลงนามลายเซ็นดิจิทัล (Digital Signature)                                                     |   **P1 (High)**   |
| **6. การย้ายข้อมูลจากระบบเดิม (Legacy Data Migration)**             | ตรวจสอบ Schema ฐานข้อมูลเดิม Anonymize ข้อมูล และรันสคริปต์ Reconcile ย้ายประวัตินักศึกษาและผลประเมินเดิมเข้าสู่ V2                                                     |  **P2 (Medium)**  |
| **7. Production Infrastructure & Deployment Gates**                 | ติดตั้ง Reverse Proxy (Nginx/Traefik) พร้อม HTTPS/TLS, Hardened Docker Compose, และการตั้งค่า Monitoring & Backup                                                       |   **P1 (High)**   |

---

## 4. จุดประสงค์และเป้าหมายในระยะถัดไป (Future Objectives & Roadmap)

### เป้าหมายที่ 1: การทำให้ระบบเป็น Multi-Faculty & Dynamic Competency เต็มรูปแบบ

- **จุดประสงค์**: ในปัจจุบันตัวอย่าง Hard Skills มีการออกแบบมาเพื่อรองรับสำนักวิชาไอที/ซอฟต์แวร์ ในขั้นตอนถัดไประบบต้องสามารถดึงชุดคำถาม (Competency Set) เฉพาะของแต่ละสำนักวิชา เช่น พยาบาลศาสตร์, นิติศาสตร์, การจัดการ, อุตสาหกรรมเกษตร ฯลฯ มาแสดงผลบนหน้า Dashboard ของนักศึกษาแต่ละคนได้อย่างอัตโนมัติตาม `schoolId` และ `programId`

### เป้าหมายที่ 2: การเปิดให้นักศึกษาสามารถแชร์และ Verify Transcript แบบออนไลน์ (Public Verification Portal)

- **จุดประสงค์**: สร้างหน้าเว็บสาธารณะสำหรับการสแกน QR Code บนใบประกาศนียบัตรหรือหนังสือรับรอง เพื่อให้บริษัทและบุคคลภายนอกสามารถตรวจสอบความถูกต้องของสมรรถนะและคะแนนของนักศึกษาได้แบบ Real-time โดยไม่สามารถปลอมแปลงเอกสารได้

### เป้าหมายที่ 3: ระบบแจ้งเตือนอัตโนมัติ (Automated Notification & Reminder Engine)

- **จุดประสงค์**: ติดตามการประเมินแบบ Proactive โดยให้ Worker ส่งอีเมลแจ้งเตือนไปยังพี่เลี้ยงสถานประกอบการเมื่อใกล้ถึง Deadline และแจ้งเตือนนักศึกษาเมื่อผลการประเมินถูกส่งเข้าสู่ระบบเรียบร้อยแล้ว

### เป้าหมายที่ 4: การนำข้อมูลเข้าสู่การทดสอบระดับผู้ใช้งานจริง (User Acceptance Testing - UAT)

- **จุดประสงค์**: ส่งมอบระบบให้กับเจ้าหน้าที่ศูนย์ประสานงานการฝึกงานและอาจารย์ที่ปรึกษา เพื่อทดสอบการใช้งานจริงในสภาพแวดล้อม Staging และเก็บข้อเสนอแนะเชิงลึกเพื่อปรับปรุงระบบให้สมบูรณ์แบบที่สุด

---

## 5. สถานะการทดสอบทางเทคนิคปัจจุบัน (Test & Build Verification)

- **Unit & Integration Tests**: ผ่าน 100% (Backend 18 Suites + Frontend 7 Suites = 25 Tests)
- **TypeScript Typecheck**: 0 Errors (`nuxt typecheck` ผ่านสมบูรณ์)
- **Dev Servers**:
  - Web UI: รันอยู่ที่พอร์ต `8180` (HTTP 200 OK)
  - API Gateway: รันอยู่ที่พอร์ต `8081` (`/api/v2`)
