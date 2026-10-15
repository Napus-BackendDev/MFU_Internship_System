# บัญชีเคสจากไฟล์ทีมทดสอบ — 2026-10-14

แหล่งข้อมูล: Internship Trarnscript Systems (1).xlsx; อ่านครบทุกชีตและทุกแถวเคส ป้าย Pass/Fail ในตารางเป็นผลเดิมของทีมทดสอบ ไม่ใช่ผล retest รอบนี้ อ้าง row + sheet เพื่อแยก case ID ที่ซ้ำกัน

| ชีต      | แถว | Case ID    | หัวข้อ                                                              | ผลเดิม |
| -------- | --: | ---------- | ------------------------------------------------------------------- | ------ |
| Admin    |   8 | TC-ADM-001 | เข้าสู่ระบบ System Admin และโหลดหน้าภาพรวม                          | Pass   |
| Admin    |   9 | TC-ADM-002 | ตารางทะเบียนนักศึกษาในหน้าภาพรวมและตัวกรองสถานะ                     | Pass   |
| Admin    |  10 | TC-ADM-003 | ส่งออกรายงาน Excel จากหน้าภาพรวม                                    | Pass   |
| Admin    |  11 | TC-ADM-004 | หน้าภาพรวมเมื่อไม่ได้เข้าสู่ระบบ (public)                           | Pass   |
| Admin    |  12 | TC-AUD-001 | [Auditor] เข้าสููล็อกอิน Auditor และตรวจหน้าภาพรวมแบบอ่านอย่างเดียว | Pass   |
| Admin    |  14 | TC-ADM-005 | เพิ่มนักศึกษาใหม่ด้วยฟอร์ม                                          | Fail   |
| Admin    |  15 | TC-ADM-006 | เพิ่มนักศึกษาไม่ผ่านการตรวจสอบ (อีเมลซ้ำ/ข้อมูลไม่ครบ)              | Pass   |
| Admin    |  16 | TC-ADM-007 | แก้ไขข้อมูลนักศึกษาและตรวจการบันทึก                                 | Pass   |
| Admin    |  17 | TC-ADM-008 | ลบ (เก็บถาวร) นักศึกษาที่มี placement กำลังดำเนินการ                | Pass   |
| Admin    |  18 | TC-ADM-009 | นำเข้านักศึกษาจาก Excel: ดาวน์โหลดเทมเพลตและ Preview                | Fail   |
| Admin    |  19 | TC-ADM-010 | นำเข้านักศึกษา: Commit และ Idempotency                              | Pass   |
| Admin    |  20 | TC-ADM-011 | ตัวกรองและ pagination ของหน้านักศึกษา                               | Pass   |
| Admin    |  21 | TC-AUD-002 | [Auditor] ดูหน้านักศึกษาแบบอ่านอย่างเดียวและถูกปฏิเสธการแก้ไข       | Pass   |
| Admin    |  22 | TC-AUD-002 | ส่งอีเมลแบบ                                                         | Pass   |
| Admin    |  24 | TC-ADM-012 | สร้างแบบฟอร์มประเมินใหม่ (Competency Set)                           | Pass   |
| Admin    |  25 | TC-ADM-013 | รหัสแบบฟอร์มซ้ำถูกปฏิเสธ                                            | Pass   |
| Admin    |  26 | TC-ADM-014 | เผยแพร่แบบฟอร์ม (Publish) และตรวจความimmutable                      | Pass   |
| Admin    |  27 | TC-ADM-015 | Publish ไม่ผ่าน validation (คำถามไม่ครบ/มาตราส่วนไม่ถูกต้อง)        | Pass   |
| Admin    |  28 | TC-ADM-016 | แก้ไขแบบฟอร์มที่เผยแพร่แล้ว: สร้าง draft version ใหม่               | Pass   |
| Admin    |  29 | TC-ADM-017 | ดูตัวอย่างแบบฟอร์ม (Live Simulator) และการคัดลอกเกณฑ์               | Fail   |
| Admin    |  31 | TC-ADM-018 | รายชื่อ Assignment และตัวกรองสถานะ                                  | Pass   |
| Admin    |  32 | TC-ADM-019 | ส่งอีเมลขอความอนุเคราะห์ประเมิน (Targeted Campaign)                 | Pass   |
| Admin    |  33 | TC-ADM-020 | ออกคำเชิญ/PIN ใหม่ (Reissue) และ PIN เดิมใช้ไม่ได้                  | Pass   |
| Admin    |  34 | TC-ADM-021 | การส่งซ้ำด้วย Idempotency Key เดิม (Replay)                         | Pass   |
| Admin    |  35 | TC-AUD-003 | [Auditor] ดูหน้าการประเมินแบบอ่านอย่างเดียวและถูกปฏิเสธการส่งอีเมล  | Pass   |
| Admin    |  37 | TC-ADM-022 | สร้างรอบประเมิน (Cycle) ฉบับร่าง                                    | Pass   |
| Admin    |  38 | TC-ADM-023 | ตรวจความพร้อมและเปิดรอบ (Activate)                                  | Pass   |
| Admin    |  39 | TC-ADM-024 | ปิดรอบ (Close) และผลต่อ Assignment                                  | Pass   |
| Admin    |  40 | TC-ADM-025 | สร้างรอบซ้ำและ Activate ซ้ำ                                         | Pass   |
| Admin    |  42 | TC-ADM-026 | ดูรายการ Delivery และตัวกรองสถานะ                                   | Pass   |
| Admin    |  43 | TC-ADM-027 | Retry delivery ที่ล้มเหลว                                           | Pass   |
| Admin    |  44 | TC-ADM-028 | Retry กับ delivery ที่ไม่ได้รับอนุญาตให้ retry                      | Pass   |
| Admin    |  45 | TC-AUD-004 | [Auditor] ดูหน้าการสื่อสารแบบอ่านอย่างเดียว                         | Pass   |
| Admin    |  47 | TC-ADM-029 | สร้างแม่แบบเอกสาร PDF ใหม่ใน Designer                               | Pass   |
| Admin    |  48 | TC-ADM-030 | อัปโหลดฟอนต์พร้อมยืนยันสิทธิ์                                       | Pass   |
| Admin    |  49 | TC-ADM-031 | เผยแพร่เทมเพลตเอกสาร (Publish) และตรวจ immutable                    | Fail   |
| Admin    |  50 | TC-ADM-032 | เปิดใช้งานเทมเพลตหลัก (Activate) และตรวจรูปแบบละ 1 ฉบับ             | Pass   |
| Admin    |  51 | TC-ADM-033 | ตรวจรายการเทมเพลต การกรอง และ Draft ถูกซ่อนจากผู้ไม่มีสิทธิ์        | Pass   |
| Admin    |  52 | TC-ADM-034 | Publish ที่ไม่ผ่าน validation (placeholder ไม่รู้จัก/ฟอนต์ไม่ครบ)   | Pass   |
| Admin    |  53 | TC-ADM-035 | ทดสอบเครื่องมือการสร้างเอกสาร                                       | Fail   |
| Admin    |  54 | TC-AUD-005 | [Auditor] ดูหน้าเอกสารแบบอ่านอย่างเดียว                             | Pass   |
| Admin    |  56 | TC-ADM-035 | ดูรายการผู้ใช้และสถิติ                                              | Pass   |
| Admin    |  57 | TC-ADM-036 | เพิ่มผู้ใช้ใหม่พร้อมบทบาทและขอบเขต                                  | Pass   |
| Admin    |  58 | TC-ADM-037 | แก้ไขผู้ใช้และสลับสถานะบัญชี                                        | Pass   |
| Admin    |  59 | TC-ADM-038 | เชื่อมบัญชี MFU SSO (OIDC link) ด้วยเหตุผล                          | Pass   |
| Admin    |  60 | TC-ADM-039 | สร้างผู้ใช้อีเมลซ้ำถูกปฏิเสธ                                        | Pass   |
| Admin    |  62 | TC-ADM-040 | ดู Audit Log และตัวกรอง Request ID                                  | Pass   |
| Admin    |  63 | TC-ADM-041 | ตรวจข้อมูลใน Audit ไม่มี token/secret/PII ส่วนเกิน                  | Pass   |
| Admin    |  64 | TC-ADM-042 | System Admin กรอง actor ได้ / บุคคลทั่วไปไม่เห็นข้าม actor          | Pass   |
| Admin    |  65 | TC-AUD-006 | [Auditor] เข้าถึง Audit Log อ่านอย่างเดียว                          | Pass   |
| Admin    |  66 | TC-AUD-007 | [Auditor] ถูกปฏิเสธการเข้าหน้าตั้งค่าและผู้ใช้                      | Pass   |
| Admin    |  68 | TC-ADM-043 | เพิ่ม/แก้ไขสำนักวิชาและหลักสูตร                                     | Pass   |
| Admin    |  69 | TC-ADM-044 | รหัสสำนักวิชา/หลักสูตรซ้ำถูกปฏิเสธ                                  | Pass   |
| Admin    |  70 | TC-ADM-045 | จัดการภาคการศึกษา: เพิ่ม, ปิด/เปิด, validation วันที่               | Pass   |
| Admin    |  71 | TC-ADM-046 | Archive ข้อมูลอ้างอิงที่ถูกอ้างอิง (ไม่ hard delete)                | Pass   |
| Admin    |  73 | TC-ADM-047 | ดูและแก้ไขแม่แบบจดหมาย (Visual Studio)                              | Pass   |
| Admin    |  74 | TC-ADM-048 | คืนค่าแม่แบบจดหมายเริ่มต้น (Reset)                                  | Pass   |
| Admin    |  75 | TC-ADM-049 | Placeholder ที่ไม่รู้จักถูกบล็อก                                    | Pass   |
| Admin    |  76 | TC-ADM-050 | อ่านแม่แบบจดหมายโดยไม่ side-effect                                  | Pass   |
| Admin    |  78 | TC-ADM-051 | ดูและแก้ไขการตั้งค่า SMTP                                           | Pass   |
| Admin    |  79 | TC-ADM-052 | Conflict จาก version เก่า (Optimistic Lock)                         | Pass   |
| Admin    |  80 | TC-ADM-053 | ส่งอีเมลทดสอบ (Test Send) ในสภาพแวดล้อม Development                 | Pass   |
| Admin    |  82 | TC-ADM-054 | หน้าศูนย์ช่วยเหลือแสดงข้อมูลครบ                                     | Pass   |
| Admin    |  83 | TC-ADM-055 | Support เข้าถึงได้ทุกบทบาท                                          | Pass   |
| Admin    |  84 | TC-ADM-056 | หน้า Support ตอบสนองที่ความกว้าง 360px                              | Pass   |
| Admin    |  86 | TC-ADM-057 | ดูและแก้ไขข้อมูลจังหวัด                                             | Pass   |
| Admin    |  87 | TC-ADM-058 | รีเซ็ต 77 จังหวัดมาตรฐาน                                            | Pass   |
| Admin    |  88 | TC-ADM-059 | จัดการประเภทสถานประกอบการ (Company Types)                           | Pass   |
| Admin    |  89 | TC-ADM-060 | ลบจังหวัดที่ถูกอ้างอิงโดยนักศึกษา                                   | Fail   |
| Staff    |   8 | TC-STF-001 | ล็อกอิน Internship Staff และโหลดหน้าภาพรวม                          | Pass   |
| Staff    |   9 | TC-STF-002 | ภาพรวมแสดงข้อมูลตามขอบเขตที่ได้รับมอบหมาย                           | Pass   |
| Staff    |  11 | TC-STF-003 | Staff เพิ่ม/แก้ไขนักศึกษาในขอบเขต                                   | Pass   |
| Staff    |  12 | TC-STF-004 | Staff นำเข้า Excel (Preview + Commit) ในขอบเขต                      | Pass   |
| Staff    |  13 | TC-COO-001 | Coordinator เห็นนักศึกษาเฉพาะสำนักวิชาของตนเอง                      | Pass   |
| Staff    |  14 | TC-COO-002 | Coordinator สร้างนักศึกษาในขอบเขตของตนเอง                           | Pass   |
| Staff    |  15 | TC-COO-003 | Coordinator ถูกปฏิเสธการลบ/แก้ไขข้อมูลนอกรอบ                        | Pass   |
| Staff    |  17 | TC-STF-005 | Staff สร้างและเผยแพร่แบบฟอร์มประเมิน                                | Pass   |
| Staff    |  18 | TC-STF-006 | Staff แก้ไขแบบฟอร์มสร้าง draft ใหม่ (ไม่แตะ published)              | Pass   |
| Staff    |  19 | TC-COO-004 | Coordinator ถูกปฏิเสธหน้าแบบฟอร์มประเมิน                            | Pass   |
| Staff    |  21 | TC-STF-007 | Staff สร้าง Evaluation Assignment                                   | Pass   |
| Staff    |  22 | TC-STF-008 | Staff ออกคำเชิญ/PIN ใหม่                                            | Pass   |
| Staff    |  23 | TC-COO-005 | Coordinator ดูการประเมินในขอบเขตและถูกปฏิเสธการส่งอีเมล             | Pass   |
| Staff    |  24 | TC-COO-006 | Coordinator เรียก assignment นอกรอบ → 404                           | Pass   |
| Staff    |  26 | TC-STF-009 | Staff สร้างรอบประเมินและตรวจความพร้อม                               | Pass   |
| Staff    |  27 | TC-STF-010 | Staff สร้างรอบซ้ำและ validation ช่วงเวลา                            | Pass   |
| Staff    |  28 | TC-COO-007 | Coordinator ถูกปฏิเสธหน้ารอบประเมิน                                 | Pass   |
| Staff    |  30 | TC-STF-011 | Staff ดู delivery และ Retry ที่ล้มเหลว                              | Pass   |
| Staff    |  31 | TC-STF-012 | Retry ซ้ำด้วย idempotency key เดิม                                  | Pass   |
| Staff    |  32 | TC-COO-008 | Coordinator ถูกปฏิเสธหน้าการสื่อสาร                                 | Pass   |
| Staff    |  34 | TC-STF-013 | Staff (tenant scope) สร้างและเผยแพร่เทมเพลตเอกสาร                   | Pass   |
| Staff    |  35 | TC-ADM-035 | ทดสอบเครื่องมือการสร้างเอกสาร                                       | Fail   |
| Staff    |  36 | TC-COO-009 | Coordinator ดูหน้าเอกสารเฉพาะที่เผยแพร่แล้วและถูกปฏิเสธการจัดการ    | Pass   |
| Staff    |  38 | TC-STF-014 | Staff ดูและเพิ่มผู้ใช้ (ไม่มีสิทธิ์ OIDC link)                      | Pass   |
| Staff    |  39 | TC-STF-015 | Staff ระงับ/เปิดใช้งานบัญชีผู้ใช้                                   | Pass   |
| Staff    |  40 | TC-COO-010 | Coordinator ถูกปฏิเสธหน้าผู้ใช้ระบบ                                 | Pass   |
| Staff    |  42 | TC-STF-016 | Staff อ่าน Audit Log ของตนเองและขอบเขต                              | Pass   |
| Staff    |  43 | TC-COO-011 | Coordinator ถูกปฏิเสธหน้า Audit Log                                 | Pass   |
| Staff    |  45 | TC-STF-017 | Staff เพิ่มหลักสูตร/รายวิชา/ภาคการศึกษา                             | Pass   |
| Staff    |  46 | TC-STF-018 | Staff แก้ไข/ปิดภาคการศึกษาและ validation วันที่                     | Fail   |
| Staff    |  47 | TC-COO-012 | Coordinator ถูกปฏิเสธหน้าสำนักวิชาและหลักสูตร                       | Pass   |
| Staff    |  49 | TC-STF-019 | Staff แก้ไขแม่แบบจดหมายได้                                          | Pass   |
| Staff    |  50 | TC-STF-020 | Staff ถูกปฏิเสธหน้าตั้งค่า SMTP (System Admin เท่านั้น)             | Pass   |
| Staff    |  52 | TC-STF-021 | Staff เข้าหน้าสนับสนุนและ FAQ                                       | Pass   |
| Staff    |  53 | TC-COO-013 | Coordinator เข้าหน้าสนับสนุนได้                                     | Pass   |
| Staff    |  55 | TC-STF-022 | Staff ดูข้อมูลจังหวัด/ประเภทสถานประกอบการแบบอ่านอย่างเดียว          | Pass   |
| Staff    |  56 | TC-STF-023 | Staff แก้ไขข้อมูลจังหวัดไม่ได้โดยตรง (negative)                     | Pass   |
| Student  |   8 | TC-STD-001 | นักศึกษาล็อกอินและดูข้อมูลการฝึกงานของตนเอง                         | Pass   |
| Student  |   9 | TC-STD-002 | แสดงสถานะการประเมิน (pending/inProgress) โดยไม่เปิดเผยคะแนน         | Pass   |
| Student  |  10 | TC-STD-003 | แสดงผลประเมินเมื่อส่งแล้ว (submitted) พร้อม snapshot                | Pass   |
| Student  |  11 | TC-STD-004 | ข้อมูล Organization/Evaluator เฉพาะ Placement ของตนเอง              | Pass   |
| Student  |  12 | TC-STD-005 | ขอดูเอกสารที่ออกแล้ว (Download Modal)                               | Pass   |
| Student  |  13 | TC-STD-006 | ขอดูเอกสาร: ก่อนผลประเมินเสร็จและ template ไม่พร้อม                 | Pass   |
| Student  |  14 | TC-STD-007 | ขอลองเอกสาร PDF (idempotency) และติดตามสถานะ                        | Pass   |
| Student  |  15 | TC-STD-008 | นักศึกษาถูกปฏิเสธการเข้าถึงข้อมูลคนอื่นและหน้า admin                | Pass   |
| Student  |  17 | TC-STD-009 | นักศึกษาเข้าหน้าสนับสนุนจาก footer                                  | Pass   |
| Student  |  18 | TC-STD-010 | ฟอร์มสนับสนุนไม่ส่งข้อมูลจริง (disabled)                            | Pass   |
| Student  |  19 | TC-STD-011 | หน้าข้อมูลการฝึกงานแสดงผลที่ 360px                                  | Pass   |
| Advisor  |   8 | TC-EVA-001 | Evaluator เข้าสู่ระบบและเห็นหน้าภาพรวม                              | Pass   |
| Advisor  |   9 | TC-EVA-002 | ภาพรวมของ Evaluator ไม่มีข้อมูลเกินขอบเขต assignment                | Pass   |
| Advisor  |  11 | TC-EVA-003 | เห็นข้อมูลนักศึกษาที่ได้รับมอบหมายเท่านั้น                          | Pass   |
| Advisor  |  12 | TC-EVA-004 | Access assignment ของ evaluator อื่นไม่ได้                          | Pass   |
| Advisor  |  13 | TC-EVA-005 | ข้อมูล organization ของ placement อื่นเข้าไม่ถึง                    | Pass   |
| Advisor  |  15 | TC-EVA-006 | ดูรายการประเมินของตนเอง                                             | Pass   |
| Advisor  |  16 | TC-EVA-007 | Evaluator ไม่มีสิทธิ์ส่งอีเมล/ออกคำเชิญ                             | Pass   |
| Advisor  |  17 | TC-EVA-008 | Evaluator เปิดแบบฟอร์มประเมินจากหน้า /app/evaluations               | Pass   |
| Advisor  |  18 | TC-EVA-009 | Evaluator เปลี่ยนไปทำแบบฟอร์มอื่น (logout)                          | Pass   |
| Advisor  |  20 | TC-EVA-010 | Evaluator ถูกปฏิเสธหน้าเอกสาร                                       | Pass   |
| Advisor  |  21 | TC-EVA-011 | Evaluator ถูกปฏิเสธการ generate เอกสารของผู้อื่น                    | Pass   |
| Advisor  |  23 | TC-EVA-012 | Evaluator เข้าหน้าสนับสนุนได้                                       | Pass   |
| Evaluter |   8 | TC-EVL-001 | เปิดหน้าประเมินด้วย PIN ที่ถูกต้อง                                  | Pass   |
| Evaluter |   9 | TC-EVL-002 | PIN ผิดและการลองซ้ำหลายครั้ง (Rate Limit)                           | Pass   |
| Evaluter |  10 | TC-EVL-003 | เปิดด้วยลิงก์คำเชิญ (Token) และข้อมูลรับรองถูกซ่อนจาก URL           | Pass   |
| Evaluter |  11 | TC-EVL-004 | บันทึกร่างและกลับมาทำต่อ (Resume)                                   | Pass   |
| Evaluter |  12 | TC-EVL-005 | Draft revision ชนกัน (สองแท็บ)                                      | Pass   |
| Evaluter |  13 | TC-EVL-006 | ส่งแบบฟอร์มไม่ครบถูกปฏิเสธ                                          | Pass   |
| Evaluter |  14 | TC-EVL-007 | ส่งแบบฟอร์มสำเร็จและเป็น immutable                                  | Pass   |
| Evaluter |  15 | TC-EVL-008 | Submit ซ้ำด้วย idempotency key เดิม (replay)                        | Fail   |
| Evaluter |  16 | TC-EVL-009 | Assignment หมดอายุ/เกินกำหนดส่ง                                     | Pass   |
| Evaluter |  17 | TC-EVL-010 | คำเชิญหมดอายุ/ถูกเพิกถอน                                            | Pass   |
| Evaluter |  18 | TC-EVL-011 | URL ?pin= ที่ไม่ครบ 16 หลักไม่ทำการ verify อัตโนมัติ                | Pass   |
| Evaluter |  19 | TC-EVL-012 | เปลี่ยน PIN/ออกจากฟอร์มและประเมินนักศึกษาคนอื่น                     | Pass   |
