# Workflow และผลทดลองใช้งาน localhost — 2026-10-15

## เป้าหมายและสภาพแวดล้อม

ผู้ใช้ขอให้เปิด localhost วิเคราะห์ระบบ วางลำดับงานตั้งแต่เริ่มจนจบ แล้วทดลองผ่าน UI ตามลำดับนั้น ใช้ Web และ API จริงพร้อม MongoDB replica set, Redis, Worker, SMTP capture และ S3 สำหรับทดสอบ ไม่มี mock API และไม่ส่งอีเมลออกภายนอก

ระบบเดิม `localhost:8080` มีนักศึกษา 99 คน จึงแยกข้อมูลทดสอบในฐานข้อมูล `internship_ui_workflow` พอร์ต MongoDB 37017 ใช้ Redis 8.0.5 ที่ติดตั้งอยู่ใน Ubuntu WSL บนพอร์ต 16379 โดยมี directory ของงานเอง ระบบ Redis เดิมบนพอร์ต 6379 เป็น 3.0.504 ไม่รองรับ BullMQ ปัจจุบัน ไม่แก้หรือหยุดระบบเดิม

- Web: `http://localhost:18082`
- API: `http://localhost:18083/api/v2`
- Mailpit: `http://localhost:18025` รับ SMTP ที่ 11025 ไม่มี relay/forward
- S3rver: `http://127.0.0.1:19000` bucket `internship-ui-workflow` ใช้เฉพาะทดสอบ
- runtime/logs: `.runtime/ui-workflow/` ไม่ติดตามด้วย Git

Mailpit ใช้ binary จาก [ผู้พัฒนา](https://github.com/axllent/mailpit/releases/tag/v1.31.5); S3rver ใช้ [แพ็กเกจสำหรับทดสอบ S3](https://www.npmjs.com/package/s3rver) ไม่ได้เพิ่ม dependency ของ application

## ลำดับงานที่วางจากโครงสร้างระบบ

1. **Admin — เตรียมระบบ:** เข้าสู่ระบบ ตรวจสำนักวิชา หลักสูตร รายวิชา เทอม จังหวัด และ SMTP capture ข้อมูลอ้างอิงต้อง active และสัมพันธ์กัน
2. **Admin — แบบประเมิน:** ตรวจโครงสร้างคำถาม/สมรรถนะ ตรวจ Simulator และใช้ฉบับ Published ที่ต้องการ รอบประเมินต้องตรึง version นี้
3. **Staff — นักศึกษาและการฝึกงาน:** เพิ่มข้อมูลสมมติ เลือกสำนักวิชา/หลักสูตร/รายวิชา/เทอม ระบุสถานประกอบการและชื่อ/อีเมลผู้ประเมิน ตรวจรายละเอียดและสถานะความพร้อม การนำเข้าต้อง preview และยืนยันรายแถวก่อน commit
4. **Staff — ส่งประเมิน:** สร้าง assignment/campaign จากข้อมูลนักศึกษาและฉบับ Published ยืนยันผู้รับ/กำหนดเวลา แล้วส่งเข้าคิว ตรวจสถานะ delivery และข้อความที่ Mailpit
5. **Evaluator — ทำแบบประเมิน:** ใช้ invitation/PIN ของ assignment ที่สร้างผ่าน UI ตรวจชื่อนักศึกษา กรอกคำตอบ บันทึก Draft เปิดซ้ำตรวจคำตอบ ยืนยัน consent และ Submit ผลสุดท้ายต้อง immutable
6. **Staff/Admin — ตรวจผลและจบการฝึกงาน:** ตรวจ dashboard/assignment/result ว่าส่งแล้ว คะแนน/คำตอบตรงกัน เลือกเมนูนักศึกษา → จบการฝึกงาน → ยืนยันวันที่สิ้นสุดจริงเวลาไทยและเหตุผล ระบบตรวจทุก assignment/final และ Audit ใน transaction เดียว
7. **Admin — แม่แบบเอกสาร:** เปิด Studio สร้าง/ปรับ Draft ด้วยฟอนต์ที่มีไฟล์จริง ตรวจ preview และเผยแพร่ฉบับใหม่ ไม่แก้ Published เดิมโดยตรง
8. **Student — ผลและเอกสาร:** เข้าบัญชีที่ผูกกับนักศึกษาทดสอบ ตรวจข้อมูล/ผล สร้าง transcript และ certificate รอ Worker ตรวจสถานะ Ready และดาวน์โหลด PDF ตรวจข้อความไทย/คะแนน/ชื่อนักศึกษา
9. **ตรวจขอบเขตสิทธิ์และจบงาน:** Advisor อ่านเฉพาะ scope, Student ไม่เห็นข้อมูลอื่น, ไม่มีเมลจริงออกภายนอก บันทึกสิ่งที่ผ่าน ปัญหาที่แก้ และขั้นตอนที่ยังผ่านไม่ได้โดยไม่เรียกขั้นตอนที่ติดว่าเสร็จ

## ผลระหว่างดำเนินการ

- แยก environment สำเร็จ; API readiness ยืนยัน MongoDB และ Redis `ok` ไม่มีการเปลี่ยนข้อมูลนักศึกษา 99 คนในระบบเดิม
- พบ Web production build ไม่มี endpoint proxy `/api/v2` (มีเฉพาะ `nitro.devProxy`); เพิ่ม thin server proxy ไปยัง `apiInternalBaseUrl` เพื่อให้ browser ใช้ same-origin และรักษา cookie/request/response
- Admin ตรวจ Academic: 14 Schools, 36 Programs, 37 Courses, 3 Terms; ใช้เทอมเปิด `DEV-2026-1` ตรวจ Simulator แล้วเลือก IT เห็นเฉพาะ General + IT + Suggestion
- Staff เพิ่มนักศึกษาสมมติ `6531501009` ชื่อ `นักศึกษา ทดสอบ Workflow`, เลือก IT/SE/1301493/DEV-2026-1 พร้อมสถานประกอบการและอีเมลผู้ประเมิน `.test` ระบบแจ้งขาดอาจารย์ จึงเติมอาจารย์สมมติผ่าน Edit แล้วสถานะ Ready
- การส่งครั้งแรกพบ race: API enqueue แล้ว direct-send ขณะ Worker หมุน PIN ทำให้ Worker เสีย lease และ PIN ที่ UI แสดงใช้ไม่ได้ แก้ send/bulk/targeted/reissue ให้มี Worker เป็น sender เพียงรายเดียว คิวล้มเหลวยังคง outbox ไม่ fallback ส่งซ้ำ และไม่คืน PIN เก่าใน response
- ออกคำเชิญใหม่ผ่าน UI พร้อมเหตุผล audit กำหนดส่งเดิมไม่เปลี่ยน Mailpit รับเมลจาก Worker จริง 1 ฉบับ แล้วใช้ PIN จากเมลเข้าแบบประเมินได้ ไม่เก็บ PIN/token ในรายงานหรือความจำ
- Evaluator ให้คะแนน 4 ทั้ง 8 ข้อและข้อเสนอแนะ 2 ข้อ บันทึก Draft แล้ว reload คำตอบยังครบ Submit ผ่าน UI แล้ว reload ยังแสดงผลสุดท้ายที่ล็อก คะแนน 4/5 ทุกข้อ
- Staff dashboard แสดง Submitted 1 คน, Hard Skill 4.0/5 และ Soft Skill 4.0/5 ตรงกับคำตอบ
- พบชื่อจาก API เป็น string แต่ Worker email schema, Evaluator UI และ Studio preview รองรับเฉพาะ localized object แก้รองรับทั้งสองรูปแบบ ชื่อ Evaluator UI ถูกยืนยันผ่าน reload แล้ว; Worker schema compatibility regressions ครอบคลุมชื่อไทย/string/object/en-only
- Admin สร้าง `QA Workflow Transcript` และ `QA Workflow Certificate` เป็น Draft แล้ว Published ผ่าน UI ผู้ใช้ช่วยยืนยัน dialog ของ browser ที่เครื่องมือเข้าถึงไม่ได้ หลังจากนั้นเปลี่ยนการยืนยันแม่แบบหลักเป็น dialog ในแอปและเล่นผ่านได้โดยไม่ต้องให้ผู้ใช้ช่วยอีก
- ผลตรวจโค้ดล่าสุด: API 426 ผ่าน/Redis 4 skipped; Worker 49 ผ่าน/Redis 1 skipped; Web 82 ผ่าน; API typecheck/build, Worker build, Web typecheck/build และ scoped ESLint ผ่าน; HTTP production-build proxy tests 4/4 ตรวจ path/query/cookies, Set-Cookie, JSON, multipart bytes และสถานะ validation ผ่าน
- พบช่องว่างเดิม: ไม่มี UI/API สำหรับเปลี่ยน Placement ที่ active เป็น completed ผู้ใช้ตอบ “เพิ่ม workflow จบการฝึกงาน” จึงเพิ่ม endpoint `POST /placements/:placementId/complete` และหน้าต่าง Staff ยืนยัน actual end, reason, expectedRevision ต้องมี assignment อย่างน้อยหนึ่ง ทุกงาน submitted และมี final version ปัจจุบัน ไม่ superseded; บันทึก status/date/revision/Audit แบบ atomic รองรับ missing `__v`, scope และ concurrent requests
- ป้องกันช่องทางข้าม completion: normal Placement create ไม่รับ completed; ส่งคำเชิญไม่เปิด completed กลับ active และไม่ reset submitted เป็น pending; การปรับ Placement เดิมจากคำเชิญอยู่ใน transaction เดียวกับ outbox และ assignment creation ล็อก Placement ร่วมกับ completion
- Staff จบ Placement สมมติผ่าน UI ด้วยวันที่ `2026-10-15 01:44 Asia/Bangkok` และเหตุผล QA จากนั้น Student เห็นปุ่มขอเอกสารใช้งานได้ ตรวจ Audit ผ่าน UI พบ `placements.completed`, actor `dev:staff@mfu.ac.th`, เวลาไทยถูกต้อง แก้หน้าจอ Audit ที่อ่าน `createdAt/actorEmail` ผิดสัญญาให้ใช้ `occurredAt/actorId`
- พบ Transcript active ซ้ำสองแม่แบบ ทำให้ Student หยุดอย่างถูกต้อง แต่ Admin เดิมเลือกแม่แบบ active เป็นหลักซ้ำไม่ได้ แก้เมนูให้เลือกได้เมื่อชนกัน แล้วใช้ UI กำหนด `QA Workflow Transcript` เป็นหลัก จน active PDF 1/1 และ Certificate 1/1
- แก้ดาวน์โหลด PDF ใน production-built development: ใช้ตัวตรวจ URL เดิมตาม protocol ของหน้าเว็บ อนุญาต HTTP บนหน้า HTTP ทดสอบ แต่ยังปฏิเสธ HTTP เมื่อหน้าเป็น HTTPS, active schemes และ URL credentials
- Student กดขอ PDF จริง Worker สร้างและเก็บใน S3 ทดสอบจน Ready ทั้งสองฉบับ แล้วกดดาวน์โหลดจริงผ่าน UI: `C:/Users/asus/Downloads/internship-document.pdf` (Certificate, 11,161 bytes) และ `C:/Users/asus/Downloads/internship-document (1).pdf` (Transcript, 11,859 bytes) สำเนาหลักฐานอยู่ `.runtime/ui-workflow/certificate.pdf` และ `transcript.pdf`
- PDF ทั้งสองฉบับฉบับละหนึ่งหน้า ตรวจข้อความและเรนเดอร์ภาพด้วย pypdf/pypdfium2 ชื่อ `นักศึกษา ทดสอบ Workflow`, รหัส `6531501009` และช่วงฝึกงานตรงข้อมูลจริงของ fixture ไม่มี placeholder ค้าง ภาษาไทยอ่านได้ ไม่เห็น clipping/overlap ในภาพ Transcript แสดง Hard Skill 4.0 / 4 ข้อ และ Soft Skill 4.0 / 4 ข้อ ตรงกับผลประเมิน ภาพ/ผลตรวจอยู่ `.runtime/ui-workflow/*-page-1.png`, `pdf-validation.json`
- บริการหยุดระหว่างช่วงพัก/เครื่องมือกลับมาใหม่ กู้ MongoDB จาก directory เดิมโดยไม่ seed/reset พบ student 1, completed Placement 1 และ PDF ที่ออกแล้ว 1 ก่อนขอ Transcript ต่อ กู้ S3/Mailpit/Redis/Web/API/Worker แยกเดิมสำเร็จ

## ผลตรวจล่าสุดและขอบเขตการสรุป

- API ล่าสุด: 440 passed, 4 Redis-dependent skipped, exit 0 (59 files passed / 3 skipped); Web 82 passed; Worker 49 passed / 1 Redis-dependent skipped จากรอบก่อนหน้าที่โค้ด Worker ล่าสุด ไม่อ้างว่ารัน skipped ผ่านแล้ว
- API typecheck/build, Web typecheck/build, OpenAPI generate/check/lint, scoped API ESLint และ Web ESLint ผ่าน ผลทดสอบ/quality logs อยู่ `.runtime/ui-workflow/`
- HTTP proxy tests บน build ล่าสุดผ่าน 4/4 Root format gate ยังติด baseline นอกงาน 6 ไฟล์ (`student-import.service.ts`, `smtp-settings.service.ts`, `StudentContactsSummary.vue`, `evaluations/index.vue`, `settings/smtp.vue`, `SYSTEM_DESIGN_OVERVIEW.md`); API lint รวมติด unused `randomUUID` เดิมใน SMTP หนึ่งจุด จึงไม่อ้างว่า `pnpm verify` ผ่านทั้งคำสั่ง
- การทดลองครั้งนี้ใช้ข้อมูลสมมติหนึ่งคน และเส้นทางเพิ่มนักศึกษาด้วยมือจริงจนครบดาวน์โหลดเอกสารสองฉบับ การ import เป็นทางเลือกของขั้นตอน 3 ไม่ได้เล่นซ้ำใน environment นี้; มีผล regression จากงาน workbook รอบก่อนในรายงาน 2026-10-14 ไม่อ้างว่าเล่นทั้ง 141 เคสผ่าน UI จริงทั้งหมด
- สิทธิ์ completion ที่ไม่อนุญาตและ cross-scope ตรวจด้วย integration tests; ยังไม่ได้เดิน UI Advisor ทุกหน้าซ้ำ ไม่ได้ส่งอีเมลออกนอก Mailpit หรือเปลี่ยนข้อมูลเดิม 99 คน ไม่มี commit/push/deploy
- ทดสอบ Student เปิด `/app/students` โดยตรงผ่าน browser แล้วถูก redirect กลับ `/app` ของตน ไม่แสดงหน้าจอจัดการ Staff
- PDF เหล่านี้เป็นหลักฐาน QA จากข้อมูลสมมติ ไม่ใช่การอนุมัติเอกสารมหาวิทยาลัย/Production การรับรอง template/ผู้ลงนามจริงและ release gates เดิมยังคงอยู่
- หลักฐานภาพ: `.runtime/ui-workflow/student-documents-ready.jpg`, `audit-completion.jpg`, `staff-result.jpg`
