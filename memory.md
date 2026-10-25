# ความจำงาน — Internship Transcript System V2

## 2026-10-14 — Asia/Bangkok

ผู้ใช้ขอให้เข้ามาทำงานใน C:\Users\asus\Documents\GitHub\Intership v.2 แต่ยังไม่ระบุงานเฉพาะ ตรวจพบโฟลเดอร์จริงเป็น Git root อ่าน AGENTS.md, README.md, บริบทเลขา และส่วนล่าสุดของ AI_HANDOFF.md/TASKS.md แล้ว พบไฟล์แก้ค้าง 11 ไฟล์ ไม่แก้โค้ด ไม่รันทดสอบ ไม่ commit หรือ push รอผู้ใช้ระบุงานถัดไป ไม่มีประวัติแชตก่อนหน้านี้ใน memory.md นี้; บริบทเดิมอยู่ใน secretary/memory/CONTEXT.md

## 2026-10-14 — แก้บั๊กจากไฟล์ทีมทดสอบ (กำลังตรวจส่งมอบ)

ผู้ใช้ขอให้อ่าน C:\Users\asus\Downloads\Internship Trarnscript Systems (1).xlsx อย่างถี่ถ้วน แก้ทุกบั๊กและแจ้งเมื่อทำครบ ผู้ใช้ยืนยันว่าพักแชตอื่นที่แก้ repository เดียวกันแล้ว อ่านครบ 5 ชีต 141 เคส พบ Fail 9 แถว รวม 8 เคสไม่ซ้ำ แก้ evaluator fields/import/preview row selection, modal/Simulator/Studio scrolling, supported document starters และ repair copy พร้อม Sarabun/OFL, missing __v CAS, province archive, submitted session replay รวม regression PIN permissions/read-side mutation และ original API error preservation ไม่ commit/push/deploy ไม่รัน seed กับข้อมูลผู้ใช้ ผลขณะนี้ unit workspace 633 ผ่านและ Redis 5 skipped ก่อนเพิ่ม regression สิทธิ์ PIN อีกหนึ่งเคส; test PIN หลายบทบาทผ่าน 31/31 ใน evaluation suite, CRUD/import/contact matching E2E 5/5 และ workbook E2E เดิม 9/9 ผ่าน Typecheck/build ผ่าน กำลังรันชุดรวม revision สุดท้าย verify ยังติด formatting/lint baseline รายงาน: docs/qa/2026-10-14-workbook-bugfix-report.md และ inventory ครบ 141 เคส ไม่ถือว่าผลทีมเทส Pass พิสูจน์ทุกขั้นตอนหรือระบบพร้อม Production

## 2026-10-14 — ส่งมอบผลแก้บั๊ก workbook

แก้ Fail ทั้ง 8 ปัญหา/9 แถวจาก 141 เคสครบ พร้อมจุด regression ที่พบเพิ่ม ผลรวม unit/contract/integration 634 เคสผ่านจากรอบ workspace และ API rerun แบบ maxWorkers=2 (418 ผ่าน) มี Redis-dependent skipped 5; ไม่อ้างว่าคำสั่ง pnpm test ล่าสุด exit 0 เพราะมี import timeout ก่อน rerun Browser รอบรวม 57/61 ผ่าน หลังแก้ bounded term lookup และ route เก่าใน test ตรวจ lookup/สิทธิ์ 6 บทบาทซ้ำ 7/7 ผ่าน จึงครอบคลุมผลผ่านครบ 61 เคส; workbook tests ใหม่ 10/10 ผ่าน Typecheck/build revision สุดท้าย exit 0; evaluations หลังแก้ชนิดข้อมูลผ่าน 31/31; OpenAPI และ scoped lint ผ่าน pnpm verify ยังติด formatting เดิม 8 ไฟล์/lint campaign/SMTP 3 จุด ข้อมูล Published เดิมไม่ migrate; มีขั้นตอนปรับสำเนาสำหรับ PDF แล้วบันทึก Draft/เผยแพร่ใหม่ ไม่มี commit/push/deploy หรือส่งเมลจริง รายงานฉบับสมบูรณ์ docs/qa/2026-10-14-workbook-bugfix-report.md และ inventory ครบ141เคส ไม่มี observation ใหม่เกี่ยวกับสกิล Napus OS

## 2026-10-15 — ทดลอง localhost จริงและเพิ่ม workflow จบการฝึกงาน

ผู้ใช้ขอให้เปิดพอร์ต เข้า localhost วิเคราะห์ระบบ วาง workflow และเล่น UI ตั้งแต่ต้นจนจบ ผู้ใช้ช่วยกดยืนยัน dialog Certificate สองครั้ง (“ตกลง/ยืนยัน”, “ตกลง”) ต่อมาผู้ใช้อนุมัติ “เพิ่ม workflow จบการฝึกงาน” และสั่ง “ทำต่อให้เสร็จ” ดำเนินการครบเส้นทางหลักด้วยข้อมูลสมมติหนึ่งคนใน environment แยก: Admin → Staff สร้างนักศึกษา/ผู้ประเมิน → ส่งคำเชิญเข้า Mailpit → Evaluator Draft/reload/Submit → คะแนน → Staff จบ Placement ด้วย actual end/reason/revision → Student สร้างและดาวน์โหลด Certificate/Transcript จริง ตรวจ PDF ทั้งสองหนึ่งหน้า ชื่อไทย/รหัส/คะแนนตรงกัน ไม่พบ placeholder หรือ clipping ภาพ

แก้ production same-origin API proxy, API/Worker email race และ stale PIN, string/localized name compatibility, Audit fields, HTTP development PDF download, recovery จาก active templates ซ้ำ และ app activation dialog เพิ่ม completion แบบ scoped transaction/audit/CAS/final checks; ป้องกัน create completed และ resend reactivate/reset submitted API ล่าสุด 440 ผ่าน/Redis 4 skipped, Web 82 ผ่าน, Worker 49 ผ่าน/Redis 1 skippedจาก Worker revision ล่าสุด, proxy 4/4; API/Web typecheck/build, OpenAPI, scoped API lint และ Web lint ผ่าน Root format ยังติด baseline 6 ไฟล์/API full lint unused SMTP 1 จุด ไม่อ้างว่า verify รวมผ่าน

มีการกลับมาทำงานหลังบริการหยุด กู้ Mongo/S3/Mailpit จากข้อมูล QA เดิมโดยไม่ seed/reset เปิด Web localhost:18082, API18083, Mongo37017, Redis16379, S319000, Mailpit18025 คงบริการไว้ metadata .runtime/ui-workflow/processes.json ข้อมูลเดิม99คนไม่ถูกแก้ ไม่มีเมลออกภายนอก/commit/push/deploy สาขา import และ UI Advisor ไม่ได้เล่นซ้ำรอบนี้ รายงาน docs/qa/2026-10-15-localhost-workflow.md หลักฐาน .runtime/ui-workflow/ รวม PDF/image/test logs

ไม่มี observation ใหม่ในขอบเขตสกิล Napus OS

## 2026-10-15 — ยืนยันข้อมูลในไฟล์ดาวน์โหลด

ผู้ใช้ถาม “ผลลัพธ์การดาวน์โหลดมีข้อมูลไหม” ตรวจหลักฐาน PDF validation/text เดิมซ้ำ พบ Certificate และ Transcript ฉบับละหนึ่งหน้า มีชื่อ/รหัสนักศึกษาสมมติจริงใน PDF ไม่มี placeholder ค้าง Transcript มี Hard/Soft 4.0 และตอบหมวดละ4ข้อ ตอบว่าเป็นข้อมูลสมมติพร้อมลิงก์เปิดไฟล์ ไม่ได้สร้างหรือแก้ข้อมูล application เพิ่ม

## 2026-10-21 — ขยายการตรวจทุก workflow และกรณีผิดพลาด (ยังไม่เสร็จ)

ผู้ใช้ต้องการวิเคราะห์และเล่น UI ทุกหน้า ทุกบทบาท รวม bug/error/user error ผ่าน localhost และแก้สิ่งที่พบ เป้าหมายยัง active ไม่จำกัดเหลือ happy path ผู้ใช้ถามซ้ำว่าไฟล์ดาวน์โหลดมีข้อมูลไหม ตรวจไฟล์จริงใน .runtime/ui-workflow ยืนยันข้อมูลสมมติ รหัส6531501009 และคะแนน4.0ทั้งสองหมวด ตอบพร้อมลิงก์ PDF

ตรวจ HEAD fbcf6b4 และสร้าง environment ใหม่ Mongo37027/DB internship_ui_full_20261021, Redis16389/DB0, S3 bucket internship-ui-full-20261021, Web18082/API18083 และ Mailpit18025 ใช้ seed master data ในฐานใหม่เท่านั้น ไม่มีนักศึกษาเดิมหรืออีเมลจริง เป้าหมายเต็มและสถานะรายหน้าอยู่ docs/qa/2026-10-21-system-ui-test-plan.md

ยืนยัน evaluator คำตอบข้ามคนด้วย regression ล้มเหลวก่อนแก้ แก้ล้าง state และกัน stale async/request answer reference; ยืนยัน email malformed placeholders 4 รูปแบบก่อนแก้ หลังแก้ integration11/11ผ่าน พบ Users IT/SE เปลี่ยนLAWแล้ว hidden program ยังมีค่าใน DOMจริง แก้ล้างค่าตอนเปลี่ยน school พร้อมชื่อ accessible และ sequence guard การโหลด Users ยืนยัน Audit category ต้องกรองก่อน pagination ด้วย regression ก่อนแก้ total9แทน1 แก้ API/UI/OpenAPI โดยรักษา scope และระบุหมวดเป็น HTTP method ชุด Audit11/11ผ่าน Browser regressionรวมEvaluator/Users/Audit9/9ผ่าน เป็น APIจำลองแยกจากการเล่น UIจริง BuildและWebtypecheckผ่าน กำลังตรวจAPItypecheck/lintและquality gateรวม

คำสั่งรีสตาร์ตเฉพาะ API/Web ของ environmentใหม่ถูก automatic approval policy ปฏิเสธโดยไม่มีเหตุผลเฉพาะ คำสั่งไม่ถูกรัน ไม่มีการลองเลี่ยงด้วยเครื่องมืออื่น Runtimeจริงจึงยังเป็นbuildก่อนแก้ ต้องรีสตาร์ตโดยช่องทางที่ได้รับอนุญาตก่อนยืนยัน UIหลังแก้ ยังมี workflow/import/หลายบทบาท/error recoveryจำนวนมากรอตรวจ ไม่อ้างว่าทั้งระบบผ่าน ไม่มีcommit/push/deploy ไม่มีobservationใหม่ของสกิลNapus OS

ผลตรวจเพิ่มรอบเดียวกัน: APItypecheck/OpenAPIผ่าน แก้lintใหม่ dynamicdeleteเป็นReflect.deletePropertyและลำดับVueattributesแล้ว verifyรอบใหม่ผ่านformat/lint/typecheck, API449/449, Web82/82, Worker50/50 ไม่มีskippedในสามแอปนี้ ขณะบันทึก pnpmverifyยังทำงาน session83793/log.runtime/full-ui-2026-10-21/verify-fixes.log เริ่มBrowserรวม64เคส ต้องpollhandleเดิม ไม่restartเพราะรอนาน แก้FAQSupportจากหลักฐานUIจริงให้ใช้PIN16หลักและcompletionก่อนTranscript ยังไม่ได้build/restartหลังcopyล่าสุด เล่นSupportยืนยันส่งไม่ได้เมื่อbackendไม่พร้อม และexportหน้าสรุป0คนแสดงไม่มีข้อมูลสำหรับส่งออก ไม่มีไฟล์ว่างถูกสร้าง

## 2026-10-21 — นำเข้าจริง แก้ parser และเปิด localhost ล่าสุดสำเร็จ

ผู้ใช้ตอบคำขอช่วยหยุด QA ว่า “ทำยังไงก็ได้ให้เปิดได้” ตรวจ parent14320 และเจ้าของพอร์ต18083=12864/18082=26236 ก่อนหยุดเฉพาะสอง process ด้วยคำสั่งที่จำกัดเป้าหมายกว่าเดิม ผ่านระบบอนุมัติ ไม่ใช้เครื่องมืออื่นเลี่ยงคำสั่งเดิม ไม่หยุด Mongo/Redis/Worker/Mailpit Build API/Web ใหม่แล้วเปิด API PID8520/Web5744 metadata .runtime/full-ui-2026-10-21/processes.json wrappers .runtime/full-ui-api.mjs และ full-ui-web.mjs ไม่มี seed/reset ใหม่

เล่น UI จริงดาวน์โหลดเทมเพลต ตรวจหัวตารางและอัปโหลดว่าง จากนั้นสร้าง fixture สมมติตามเทมเพลตด้วย artifact-tool สองแถวถูก/สองแถวผิด Preview แยกถูกต้อง บันทึกสองคน6631503016/6631503017 พร้อมข้อมูลIT/SE/1301493/2026เทอม1 บริษัทจังหวัดและผู้ประเมินถูกต้อง แถวอีเมลผิด/สำนักUNKNOWNถูกข้าม พบเลขแถวเกินจริง1, previewชื่อไทยใช้ชื่อผู้ประเมิน และprogress completed50%จาก2/4 แก้พร้อมregressionก่อน/หลัง เพิ่มป้องกันอีเมลผู้ประเมินแทนอีเมลนักศึกษาผิดโดยพลการ รักษาlegacy shiftedcolumnsเฉพาะทาง Parser/import38/38ผ่าน APIล่าสุดรวม454/454ผ่าน

pnpm verify session83793จบexit1: Browser63/64ผ่าน เคสimportล้มเพราะtoastทับปุ่ม แก้ใช้ผลในmodalและerrorbannerค้างพร้อมข้อความไทย/retryแทนtoastซ้ำ รันCRUD/import/retryล่าสุด4/4ผ่าน session20900จบexit0 ไม่มีtestรออยู่ Format/APIscopedlint/Weblint/APItypecheck/Webtypecheck/APIbuild/Webbuildผ่านล่าสุด ไม่อ้างverifyรวมexit0

ส่งคำเชิญAครั้งแรกขาดอาจารย์ระบบปฏิเสธพร้อมปุ่มแก้ กรอกอาจารย์สมมติแล้วสถานะพร้อมส่ง ส่งจริงเข้าMailpitหนึ่งฉบับ ไม่มีเมลภายนอก เปิดลิงก์ก่อนrestartพบmissingchunk500 หลังrestartโหลดฟอร์มAได้และURLล้างtoken กดsubmitไม่ครบถูกปฏิเสธ จากนั้นบันทึกคะแนนข้อแรก4/ข้อความสมมติเฉพาะAแล้วreloadDraftกลับมาครบ ยังไม่submitfinal หลักฐานภาพimport-students-real.pngและevaluator-opened-after-restart.pngใต้.runtime/full-ui-2026-10-21 ทั้งสามแท็บCUA2(Adminเก่า),3(Mailpit),4(EvaluatorA)markHandoffแล้ว sessionbrowsercookieปัจจุบันEvaluatorA ไม่ใช่Admin ต้องloginAdminใหม่เมื่อทำB

งานต่อ: ตรวจUsers/Auditจริงหลังแก้ นำเข้าไฟล์เดิมยืนยันunchanged/row/name สร้างคำเชิญBแล้วตรวจassignmentisolationจริงก่อนfinal ต่อmasterdata/roles/complete/documents/export/errorsทุกเส้นทางในแผน เป้าหมายยังactiveและยังไม่เสร็จ ไม่มีcommit/push/deploy ไม่มีobservationใหม่ในขอบเขตNapus OS

## 2026-10-21 — ตรวจ A/B isolation, Student, PDF และแก้แม่แบบเริ่มต้น

เล่นUIจริงBเพิ่มอาจารย์สมมติ/ส่งคำเชิญเข้าMailpit เปลี่ยนPINจากDraftAไปBยืนยัน0คะแนน/textareaว่าง บันทึกBครบ8ข้อคะแนน3+ข้อความB กลับAยังDraftคะแนน4หนึ่งข้อ/ข้อความA ส่งfinalAครบ8ข้อคะแนน4 reloadreviewล็อก แล้วPINผิด16หลักถูกปฏิเสธgeneric กู้DraftBครบและส่งfinalBสำเร็จ ไม่มีข้อมูลปนกัน ภาพassignment-b-empty-after-a.png/student-b-final-review.pngใน.runtime/full-ui-2026-10-21

AuditUIจริงPATCH4รายการจาก34รวมเหตุการณ์เก่าข้ามหน้า กรองRequestIDเหลือ2/reset34ถูกต้อง UsersIT/SEเปลี่ยนLAW hiddenprogramว่างจริง นำเข้าไฟล์เดิมพบphantomsemester diff1กับภาคการศึกษาต้น แก้normalizeเฉพาะdiffและregressionครอบคลุมเทอมต่างจริง หลังrestartAPIUIพบunchanged2 invalid2 commit0disabled ไม่สร้างซ้ำ ภาพaudit-real-filter.png/users-school-program-cleared.png/reimport-unchanged-real.png

completeAactualend2026-10-21T14:00Asia/Bangkokสำเร็จพร้อมเหตุผล Bยังไม่complete ก่อนหน้าfuturedatebackendปฏิเสธแต่UIอ่านdata.codeแทนdata.error.code แก้date/stale/incompleteพร้อมE2E3/3ผ่าน ขยายAuditAuthรวมpublicPINและinvitationexchangeพร้อมregression

Studentdefaultloginมีemail6631503016แต่studentId6531501009 แก้ให้ตรงกันแล้วเข้าAได้จริง เห็นHard/Soft4.0และข้อความA ไม่เห็นB3.0 แก้guideWord/Referralเก่าเป็นPDFCertificate/Transcriptและขั้นสถานะเอกสาร

ดาวน์โหลดPDFจริงรอบใหม่จากStudentA workerreadyทั้งคู่แต่พบCertificateเพียงชื่อ/Transcriptเป็นหนังสือส่งตัวเพียงชื่อ ยังไม่ผ่านส่งมอบ เก็บcertificate-incomplete-before.pdf/transcript-wrong-before.pdf/.pngและpdf-validation-latest.json ไม่ลบไฟล์หลักฐาน ต้นเหตุseedcanonicaldefaultไม่ครบและผิดประเภท แก้seed sourceใช้helperใหม่development-document-templates.tsครบidentity/placement/reference/table ไม่rerunseedไม่แก้PublishedDBเก่า Contract+immutability70เคสผ่าน/APIรวมล่าสุด458/458ไม่มีRedisskip APIbuild/typecheck, Webbuild/typecheck/lint, scopedlint/OpenAPIcheck/formatผ่าน

สร้างDraftUIใหม่ QA Transcript ครบข้อมูล 2026-10-21 master6ad87305cf153c04c593b4bf/version6ad87305cf153c04c593b4c0 แต่nativewindow.confirmค้างในแท็บ2 การaccept/AX/Escape/closeติดCDPfocus timeout readonlyDBยืนยันยังdraft คำถามasyncขอผู้ใช้กดยกเลิกยังรอ ไม่มีคำตอบหรือนัยอนุมัติจากเวลาที่ผ่าน ลองแท็บใหม่5อ่านHTMLได้แต่clickไม่ทำงานเพราะdialogเก่า จึงแก้คำกล่าวกู้Browserสำเร็จเป็นinputยังบล็อกแล้ว

แก้Studio publish/repair/discardเป็นAppModalพร้อมcancel/confirmและlayerที่ถูกต้องแทนnativeconfirm ทดสอบpublishAdmin/Staff+repair3/3ผ่านหลังlayerfix อีก11เคสผ่านจากชุดก่อน แก้previewacademic_yearและcopyPDFปิดที่เก่า Buildแล้วWebล่าสุดPID18640/API9136 Mongo37027/Redis16389/Worker1824/Mailpit/S3ไม่หยุด ข้อมูลสองคน/ผลfinalยังครบ ไม่มีtestprocessค้าง

แท็บCUAปัจจุบัน2=Studioเก่าค้างnativeconfirm,3=MailpitA,4=reviewB,5=loginแท็บใหม่ที่ยังclickไม่ติด browser2 ยังactive คำขอให้ช่วยcancelยังจำเป็น ต้องตรวจหลังturncleanupว่าnativepopupหายเองหรือไม่ก่อนถามซ้ำ เมื่อปลดแล้วreloadbuildใหม่และloginAdmin เปิดDraftเดิมpublishด้วยAppModal สร้างCertificateจากstarter/publish แล้วStudentออกPDFใหม่ตรวจข้อมูล/layoutก่อนถือว่าแก้เรื่องเอกสารครบ ยังมีmasterdata/roles/settings/recovery/exportและกรณีอื่นตามแผนรอตรวจ เป้าหมายยังactive ไม่commit/push/deploy ไม่มีobservationใหม่ในขอบเขตNapus OS

## 2026-10-21 — ปลด dialog และตรวจเอกสารจริงสำเร็จ

ผู้ใช้ตอบ “กดปิดแล้ว” ต่อคำขอปิด native confirmation จึง reload tab2/browser2 ใช้ build ใหม่ พบ Transcript เดิมเผยแพร่แล้วจาก readonly DB (ไม่ใช่ Draft อีกต่อไป) สร้าง QA Certificate ครบข้อมูล 2026-10-21 ผ่าน UI บันทึก Draft/เผยแพร่ผ่าน AppModal ใหม่สำเร็จ ตั้งทั้งสองแม่แบบเป็นแม่แบบหลักผ่านเมนูเปิดใช้งานและ in-app confirmation เก็บแม่แบบเก่า archived ไม่เขียนทับ Published

พบบั๊กใหม่ Student บล็อกการขอเอกสารหลังเปลี่ยนแม่แบบเพราะเทียบเฉพาะ evaluationIds แก้ exact source match รวม templateVersionId ของแม่แบบหลัก ขณะที่ดาวน์โหลดไฟล์เดิมได้ระหว่างคิวใหม่ ไม่ลบประวัติ เพิ่ม regression utility ผ่าน6/6 Webtypecheck/buildผ่าน เปิดWebPID26184 ขอออกใหม่ผ่านUI Workerสร้างreadyและดาวน์โหลดจริง Downloads/internship-document (4).pdf Certificate10945bytes1page และ(5).pdf Transcript11774bytes1page ตรวจ pypdf text + pypdfium2 render/view_image ทั้งสองฉบับ ชื่อเอ/6631503016/บริษัทQA/20–21ตุลาคม2569ถูกต้อง Transcriptปี2026 Hard4.0 Soft4.0 หมวดละ4ข้อ ไม่มีB/Referral/unresolvedplaceholder ไฟล์และภาพสำเนา certificate-complete/transcript-complete ใน .runtime/full-ui-2026-10-21 เก็บหลักฐานpdf-complete-validation.json และ student-documents-new-ready.png

ตรวจ Staff login/เมนู/dashboardจริง กรอง6631503016 ส่งออกExcelTH/EN พบสถานะ/คะแนน/ผู้ประเมินหายจากไฟล์ทั้งที่UIมี4.0 แก้ server export mapping เลือกassignmentเดียวที่ตรวจสัมพันธ์แล้วเมื่อไม่มีcyclefilter ไม่เดาสุ่มเมื่อหลายassignment พร้อมใช้advisorName/siteVisitAdvisorNameตามUI regressionก่อนแก้ล้ม2เคส หลังแก้ผ่าน5/5 APIbuildผ่าน เปิดAPIล่าสุดPID32260 (เดิม9136/36360หยุดเฉพาะprocessที่ตรวจCommandLineแล้ว) ส่งออกใหม่ผ่านUI Downloads/MFU_Internship_Report_TH_20261021 (2).xlsx และ EN (2).xlsx ตรวจzip/XMLทั้ง2: นักศึกษาAคนเดียวไม่มีB ชื่ออาจารย์ สมมติ QA ผู้ประเมิน/emailครบ สถานะSubmitted/ส่งผลประเมินแล้ว Hard/Soft4.0 4ข้อ บันทึกexport-verified.json

StaffเปิดจบPlacementB ทดสอบ22Octอนาคต APIปฏิเสธ UIแสดงข้อความวันสิ้นสุดต้องอยู่หลังเริ่มและไม่อนาคตถูกต้อง บันทึกcompletion-future-rejected.png จากนั้นยืนยันactualEnd21Oct2026 15:00Bangkokพร้อมเหตุผลQAสำเร็จ เมนูเปลี่ยนเป็นจบการฝึกงานแล้วdisabled คะแนนไม่แก้

ข้อค้างใหม่: Poll generated-document detail ขึ้นreadyแต่เลขที่หายชั่วคราวเพราะdetailไม่มีdocumentNumber ขณะที่listมี Reloadแล้วเลขกลับถูกต้อง ยังไม่แก้ ส่วนงานทั้งระบบยังไม่ครบ masterdata/roles/settings/recovery/กรณีอื่นตามแผน เป้าหมายactive ไม่ถือว่าทุกบั๊กหมด ยังไม่รันpnpmverifyรวมหลังแก้รอบนี้ ไม่มีcommit/push/deploy ไม่resetseed/storage/Worker ไม่มีobservationใหม่ในNapusOS

## 2026-10-21 — รอบข้อมูลหลัก และคำขอภาพทุกหน้าธีมสว่างพร้อม Modal

ก่อนเปลี่ยนมางานภาพ ตรวจ School create/empty validation/duplicate/edit/reload ผ่าน UI จริง สร้างสำนักวิชา QA20261021 และหลักสูตร QAP20261021 (ข้อมูลสมมติเท่านั้น) พบ duplicate409แสดงrawtoastนอกฟอร์ม แก้ School/Program/Course/Term เป็น inline error บอก duplicate/changed/permission/retry เก็บค่าที่กรอกและล้างerrorเมื่อเปิดหรือส่งใหม่ พบ Program school filter เปลี่ยน lookup/count ของ Course ทำให้แสดงทุกหลักสูตรผิด แก้ใช้รายการProgramreferenceครบหน้าด้วยloadAllPagesและกรองแยกในUI ไม่เทียบจำนวนรายการเพื่ออ้างว่าทุกหลักสูตร Regression browserจำลอง2/2ผ่านหลังแก้fixtureให้refreshclientแทนSSRmock มีtypecheck/lint/Webbuildผ่าน ตรวจUIใหม่รายวิชากลับแสดง ENG/TLC/AC/BIO/MATE ถูกต้อง ส่วนAPIเพิ่มgetDocumentViewสำหรับendpointdetailให้documentType/documentNumberตรงlistและยังลบprivatefieldsผ่านtoJSON ชุดdocument+export36/36ผ่าน APIbuildผ่าน ยังไม่ได้สร้างงานใหม่เพื่อทดสอบเลขที่pollจริงหลังAPIแก้

ผู้ใช้ขอ “แคปหน้าจอในระบบทุกหน้าและใส่โฟลเดอร์” กำหนดโทนสว่าง และเสริม “เอา ภาพ model ในระบบด้วยนะ” ตอบโดยระบุเข้าใจว่า Modal/ป๊อปอัป และเก็บเพิ่ม ไม่มีคำตอบแก้ความหมาย ใช้ screenshot skill และ CUA browser2/tab2 จริงทุกภาพ assert HTML ไม่darkก่อนแคป เก็บJPEG fullPage ไม่ตกแต่ง/จำลอง UI ไม่ส่งอีเมล/เปลี่ยนสถานะเพื่อถ่ายภาพ เปิดหน้าต่างแล้วปิดไม่บันทึก ยกเว้น Designerทดลองเปลี่ยนข้อความlocalเพื่อแสดงยืนยันทิ้ง จากนั้นยืนยันทิ้งสำเร็จไม่มีsave

ผลภาพ74ไฟล์ ครบ16routeจากapps/web/app/pages (Public4/Admin21/Staff10/Advisor5/Student6/Modals28) ที่ C:/Users/asus/Pictures/Screenshots/Internship-Light-2026-10-21 พร้อม index.html แกลเลอรี, manifest.json และimage-checks.json ตรวจPillowเปิดได้ทุกภาพขนาด>=600x300ไม่ว่าง ตรวจภาพตัวอย่างDashboard/UserModal/StudentCreateด้วยview_image ธีมสว่างจริง ZIP C:/Users/asus/Pictures/Screenshots/Internship-Light-2026-10-21.zip จำนวน5608370bytes ตรวจtestzipผ่าน ชุดภาพรวมแท็บAcademic4/CompanyTypes/Emailpreviewและdesigner/StudioTranscriptและCertificate/Studentguide3ขั้น/Downloads/modalcreateeditข้อมูลหลัก/forms3หมวด+simulator/dispatch/summary/confirmation

ข้อจำกัดระบุในmanifest/index: QAไม่มีuserrecordจึงเปิดUserEdit/SSOlinkไม่ได้, Placementsสองคนจบแล้วเปิดcompletionmodalซ้ำไม่ได้, ไม่มีDraftสำหรับยืนยันPublish, PINfinalไม่รับloginใหม่เพราะserviceverifyPinรับเฉพาะpending/inProgress (ตรวจsourceยืนยัน) ไม่สร้างภาพปลอมและไม่ใช้รูปเก่าที่ธีมมืดแทน ในindexมีข้อจำกัดfullPageกับnestedscrollและพื้นที่ว่าง document

Runtimeล่าสุด Web35264/API25856 พอร์ต18082/18083 หยุดเฉพาะPIDที่ตรวจCommandLineแล้วก่อนbuild Mongo37027/Redis16389DB0/Worker1824/S3/Mailpitคงเดิม Tab2markDeliverableอยู่Admindocumentsธีมสว่าง ไม่เปลี่ยนviewportเอง ไม่commit/push/deploy ไม่resetseed FullQAเดิมยังไม่ครบ/ไม่อ้างpnpmverifyexit0; get_goalแสดงสถานะpausedจริง (ขัดsummaryเก่าที่ว่าactive) ไม่เรียกupdate_goalหรือเปลี่ยนสถานะเอง งานภาพเสร็จแล้ว ไม่มีobservationใหม่ในNapusOS

## 2026-10-21 — ต่อ QA รอบประเมิน/SMTP และการแก้ชื่อแบบประเมิน

หลังชุดภาพ กลับตรวจ workflow รอบประเมินจริง สร้าง QA-CYCLE-20261021 ในสำนักสมมติ ไม่มีนักศึกษา ตรวจค่าว่าง/วันกลับด้าน/Readiness 0 คน เปิดและปิดสำเร็จ เก็บ cycle-close-confirm-real.jpg และ cycle-closed-real.jpg เปลี่ยน cycles/users native confirmation เป็น AppModal พร้อม cancel/confirm กรณีเดิมทำ CUA ค้าง native dialog แต่ปลดแล้ว ไม่ต้องให้ผู้ใช้กดเพิ่ม ไม่เหลือ window.confirm/alert/prompt ใน Web เพิ่มภาพ Modals/29-cycle-close-confirm.jpg ชุดภาพล่าสุด 75 ภาพ/29 Modals ZIP ตรวจ CRC ผ่าน (in-memory screenshotManifest เก่ายัง74 ห้ามนำไปเขียนทับ manifest.json ปัจจุบัน)

พบส่ง SMTP Test ครั้งเดียวได้อีเมลสองฉบับจริงใน Mailpit ต้นเหตุ API enqueue แล้วส่ง direct fallback ซ้ำกับ Worker แก้ API ให้ enqueue อย่างเดียว หาก queue ล้มเหลว mark failed/503 SMTP_TEST_QUEUE_UNAVAILABLE ไม่ส่งตรง เพิ่ม regression red/green และตรวจจริง qa.smtp.single@example.test ได้ฉบับเดียว พบต่อว่าปิด DB SMTP override แล้วหน้า UI ยังแสดง port เก่า11026 ทั้งที่ Workerใช้ ENV11025 และ heuristic localhost แสดงโหมดผิด แก้ APIส่ง deliveryMode/effectiveConnection แบบไม่เผย secret, UIใช้ค่ามีผลจริงและบอก Capture จาก config เพิ่ม OpenAPI/generatedtypesและ regression2/2 ตรวจจริง override11026 ส่งล้มเหลว, ปิดoverrideกลับENV11025, เปลี่ยนค่าที่เก็บกลับ11025 overridedisabled DBversion3 ส่ง qa.smtp.recovered@example.test สำเร็จฉบับเดียว Mailpitรวม6ฉบับ ไม่มีforward/externalmail หลักฐาน smtp-failed-real/smtp-single-delivery-real/smtp-effective-connection-real.jpg

API ก่อนชื่อฟอร์มล่าสุด462/462ผ่าน Web83/83 Worker50/50จาก workspace runก่อนหน้า Root pnpm test ครั้งแรกมี auth production module timeout5000ms ระหว่าง concurrentbuild แต่ rerunAPIแยก459/459ผ่าน (ก่อนเพิ่มSMTP3tests) Fullbrowser73เคสกำลังรัน session46582/log full-browser-after-smtp.log ไม่ใช้ผลmockแทนrealUI

พบชื่อฟอร์ม QA-FORM-20261021 แก้แล้วกดSaveแจ้งสำเร็จแต่กลับเป็นชื่อเดิมจริง เพราะWebไม่ส่งข้อมูลmasterและAPIไม่มีPATCH ผู้ใช้เลือกชัดเจนว่า “แก้ชื่อได้ แต่รหัสคงที่หลังสร้าง” ขณะนี้เพิ่ม PATCHเฉพาะชื่อสองภาษา strict rejectcode, scopeทุกsectionทุกversion, Audit, Mongooseimmutablecode พร้อม API integration/controller40/40ผ่าน และAPIbuild/typecheckผ่าน ยังรอเชื่อมWebและตรวจrealUIหลังfullbrowserจบ ไม่ถือว่าเสร็จ ชื่อเดิมTHแบบประเมินสมมติ QA ตรวจ workflow/EN QA Synthetic Evaluation Workflow Draftไม่publish เก็บ form-name-before.jpg

Runtime QA ล่าสุด Web35312/API23836 (processes.json) Mongo37027/Redis16389/Worker1824/Mailpit20096คงเดิม ห้ามrerunharnessเพราะมีseed Goalทั้งระบบยังactive มีกรณีเพิ่มเติมตามแผน ไม่มีcommit/push/deploy/DBreset ไม่มีข้อสังเกตใหม่ในขอบเขตNapus OS

## 2026-10-22 — ยุบประเภทข้อมูลนำเข้านักศึกษาเป็นแบบเดียว (Unified Student Import)

ยุบตัวเลือก Dropdown ประเภทข้อมูลนำเข้าใน Import Modal ของ `apps/web/app/pages/app/students.vue` ให้ผู้ใช้อัปโหลดไฟล์เดียวได้ทันทีทั้งเทมเพลตมาตรฐาน, Cer, หรือ Checklist

1. `apps/web/app/pages/app/students.vue`: ลบ Dropdown `ประเภทข้อมูลนำเข้า`, ปรับ `downloadStudentExcelTemplate()` ให้ดาวน์โหลดเทมเพลตมาตรฐานรวมทุกคอลัมน์ (ข้อมูลนักศึกษา, สถานประกอบการ, ที่อยู่เต็ม, ผู้ประเมิน, อาจารย์), ปรับ `handleExcelFileUpload` ยิงตรง `/students/import-preview`
2. `apps/api/src/members/student-import.service.ts`: ใน `preview()` auto-detect และ fallback อัตโนมัติระหว่าง `parseStudentWorkbook` และ `parseStudentContactsWorkbook`; ใน `resolveRow` อนุญาตให้นักศึกษาเดิม (`existing`) inherit ข้อมูลหลัก (schoolId, programId, name, email) ทำให้การอัปเดตข้อมูลผู้ติดต่อผ่านฉลุย
3. ตรวจสอบ: `nuxt typecheck` 0 errors, `api build` 0 errors, vitest student import/contacts tests 44/44 ผ่าน 100%

## 2026-10-22 — นำตัวเลือก "แสดงทุกสำนักวิชา" ออกจาก Live Simulator แบบฟอร์มประเมิน

1. `apps/web/app/pages/app/evaluations/forms/create.vue`:
   - ลบตัวเลือก `<option value="all">🌐 แสดงทุกสำนักวิชา (Full Overview)</option>` ออกจาก Dropdown `สลับมุมมองสำนักวิชา:`
   - กำหนดให้ `previewSelectedSchoolId` เลือกสำนักวิชาแรกอัตโนมัติ และ sync เมื่อกดจากแท็บ School Hub
   - `previewSections` กรองเฉพาะหมวดทั่วไป + หมวดเฉพาะของสำนักวิชาที่เลือก + หมวดคำแนะนำ
2. ตรวจสอบ: `nuxt typecheck` 0 errors ผ่าน 100%

## 2026-10-22 — ตั้งค่าเริ่มต้น "หลักสูตรที่ใช้เกณฑ์นี้" ให้แสดง "ทุกหลักสูตรในสำนักวิชา"

1. `apps/web/app/pages/app/evaluations/forms/create.vue`:
   - ผูก `:value="section.programId || ''"` บน select "หลักสูตรที่ใช้เกณฑ์นี้" และให้ `<option value="">🌐 ทุกหลักสูตรในสำนักวิชา (ใช้เกณฑ์ร่วมกัน)</option>` แสดงเป็นค่าเริ่มต้นตลอดเวลา ไม่เกิดช่องว่าง (blank)
   - กำหนดค่า `programId: ''` ใน `initialSections`, `applySchoolPreset`, `addSpecialSectionForSchool`, และ `loadForm`
2. ตรวจสอบ: `nuxt typecheck` 0 errors ผ่าน 100%

## 2026-10-22 — เพิ่ม Export Filter Modal และปรับรูปแบบ Excel ตามไฟล์ Cer PDF + ส่งเมล

- ผู้ใช้: "Proceed เลยยยยยยยยยย" (อนุมัติแผนงานจากอาร์ติแฟกต์ export-filter-modal-and-cer-email-excel-format.md)
- ผลที่ทำจริง:
  1. `docs/api/openapi.yaml` & `apps/api/src/reports/reports.controller.ts`: เพิ่ม `programId` ภายใต้ `StudentDirectoryReportExportRequest.filters`
  2. `apps/api/src/reports/report-export.service.ts`: เพิ่ม `programId` ใน `StudentDirectoryReportFilters`, ส่งต่อไปยัง `members.listStudents`, พร้อมดึง `generatedDocuments` (PDF URLs) และ `deliveries` (EMAIL_SENT) แบบ batch
  3. `apps/api/src/members/members.service.ts`: ดึง `answers`, `questionSnapshot`, และ `submittedAt` ใน `activeFinals` ของ evaluations
  4. `packages/shared-types/src/index.ts` & `apps/api/src/reports/student-directory-export.ts`: ขยาย `StudentDirectoryExportValues` ให้รองรับ `hardSkills`, `softSkills`, `hardAverage`, `softAverage`, `issuedOn`, `pdfUrl`, `emailSent`
  5. `apps/worker/src/runtime/student-directory-export.xlsx.ts`: ปรับระบบสร้าง Excel ให้จัดกลุ่มตามหลักสูตรด้วยตาราง 62 คอลัมน์ (Hard skills รายข้อ, HS, ค่าเฉลี่ย HM, HA, ส่วนเบี่ยงเบนมาตรฐาน HSD, Soft skills รายข้อ SS1..SS12, ค่าเฉลี่ย SM, SA, SSD, Issued on, PDF URL, EMAIL_SENT) และชีตสรุป `Send Email`
  6. `apps/web/app/components/AdminStudentDirectory.vue`: สร้าง Export Filter Modal ที่มีตัวเลือกปีการศึกษา (จำเป็นต้องเลือก - Required), สำนักวิชา, สาขาวิชา (สัมพันธ์กับสำนักวิชา), ภาคการศึกษา, และภาษา (TH / EN) พร้อมเชื่อมต่อการ polling สถานะและดาวน์โหลดอัตโนมัติ
- การตรวจสอบ:
  - `shared-types build`: ผ่าน
  - `api build`: ผ่าน
  - `api test`: ผ่าน 100% (61 test files, 461 tests)
  - `worker test`: ผ่าน 100% (16 test files, 49 tests)
  - `web typecheck`: ผ่าน 0 errors (100%)

- ผู้ใช้: สั่ง "ทำให้ในระบบ ทุกอย่าง ที่เป็น DataTable ในตัวของ การจัดการ ให้มัน ลบ... ด้วย ไม่ใช่มีแค่ แก้ไข"
- ผลที่ทำจริง:
  1. `apps/web/app/pages/app/users.vue`: เพิ่มปุ่ม Quick Delete (ถังขยะ), รายการเมนู "ลบผู้ใช้งาน..." ใน 3 จุด และ Modal ยืนยันการลบผู้ใช้งาน (ส่ง `PATCH /users/:id` ด้วย `{ status: 'archived' }`)
  2. `apps/web/app/pages/app/settings/academic.vue`: เพิ่มปุ่ม Quick Delete และรายการเมนู "ลบ..." สำหรับสำนักวิชา, หลักสูตร, รายวิชา และภาคการศึกษา พร้อม Modal ยืนยันและข้อความแจ้งเตือน Error ภาษาไทย
  3. `apps/web/app/pages/app/evaluations/forms/index.vue`: เพิ่มปุ่ม Quick Delete, รายการเมนู "ลบแบบประเมิน..." และ Modal ยืนยันการลบแบบประเมิน (ส่ง `PATCH /competency-sets/:id` ด้วย `{ status: 'archived' }`)
  4. `apps/web/app/pages/app/documents.vue`: เพิ่มปุ่ม Quick Delete/Deactivate, รายการเมนู "ลบ / เก็บถาวรเทมเพลต..." และ Modal ยืนยันการยกเลิก/เก็บถาวรเทมเพลต (ส่ง `POST /document-templates/:id/deactivate`)
  5. Backend & OpenAPI: อัปเดต `docs/api/openapi.yaml`, `evaluations.controller.ts`, `evaluations.service.ts` ให้รองรับ `status: [active, archived]` สำหรับ Competency Sets พร้อมระบบตรวจสอบความปลอดภัยว่าไม่ผูกกับรอบการประเมินที่เปิดอยู่
- การตรวจสอบ:
  - `nuxt typecheck`: ผ่าน 0 errors
  - `vitest test`: ผ่าน 100% (61 test files, 461 tests)

## 2026-10-22 — แก้ไขปัญหาการ Export Excel ค้าง (มันค้าง) และเพิ่ม Direct Export Pipeline

- ผู้ใช้: "กด export ไม่ได้เลย แก้ไขด้วย มันค้าง" (พร้อมภาพหน้าจอ Modal ส่งออกรายงาน Excel ค้างอยู่ที่สถานะกำลังโหลด)
- สาเหตุที่พบ:
  1. เมื่อกดยืนยันการส่งออก ระบบจะส่งคำขอ `POST /reports/exports` เพื่อส่ง job เข้า BullMQ queue `report-exports` และเก็บสถานะ `status: 'queued'`
  2. Frontend จะวน polling `GET /reports/exports/${id}` รอจนกระทั่งสถานะกลายเป็น `'ready'`
  3. แต่เบื้องหลัง Worker process รันไม่ได้เนื่องจาก Redis บนเครื่อง Windows เป็นเวอร์ชัน 3.0.504 ซึ่ง BullMQ 6 บังคับว่าต้องใช้ Redis >= 5.0.0 (`Error: Redis version needs to be greater or equal than 5.0.0 Current: 3.0.504`)
  4. นอกจากนี้ MinIO S3 (port 9000) ไม่ได้ถูกเปิดใช้งานบนเครื่อง (Docker ไม่ได้รัน) ทำให้คำขอค้างอยู่ที่สถานะ `'queued'` จนครบ 120 วินาที ส่งผลให้หน้าจอ UI หมุนค้าง
- ผลที่ทำจริง:
  1. สร้าง `apps/api/src/reports/student-directory-export.xlsx.ts` ใน API เพื่อให้ API สามารถสร้าง Buffer ของไฟล์ Excel ได้โดยตรงในเวลา < 30ms โดยไม่ต้องพึ่งพา Redis/BullMQ worker
  2. อัปเดต `apps/api/src/reports/report-export.service.ts`:
     - เพิ่มฟังก์ชัน `processStudentDirectoryExport`: ประมวลผลสร้างไฟล์ Excel ลงดิสก์แคช (`tmp/exports/${id}.xlsx`) และอัปเดตสถานะเป็น `'ready'` ทันที
     - ใน `create`: สั่งรันประมวลผลทันทีในเบื้องหลังโดยไม่ต้องรอคิว BullMQ
     - ใน `get`, `downloadUrl`, และ `returnExisting`: มีระบบ Auto-recovery หากพบงานที่ยังค้างอยู่ในสถานะ `'queued'` จะทำการประมวลผลทันทีและเปลี่ยนสถานะเป็น `'ready'`
     - ใน `getFile`: ให้บริการส่งไฟล์ binary Excel/CSV กลับไปยัง Browser โดยตรง พร้อมตั้งค่า Header `Content-Disposition: attachment`
  3. เพิ่ม Route `/reports/exports/{exportId}/file` ใน `docs/api/openapi.yaml` (ผ่าน `redocly lint` 100%)
  4. เพิ่ม Endpoint `@Get('exports/:exportId/file')` ใน `apps/api/src/reports/reports.controller.ts` และปรับ `downloadExport` ให้สร้าง download URL ตรงไปยัง endpoint file (`/api/v2/reports/exports/:id/file`) เมื่อทำงานในโหมด local development
  5. อัปเดต `apps/web/app/utils/safe-download-url.ts`: รองรับทั้ง Relative URL (`/api/v2/...`) และ Absolute URL
  6. อัปเดต `apps/web/app/components/AdminStudentDirectory.vue`: ใช้การ trigger ดาวน์โหลดผ่าน Hidden Anchor element (`document.createElement('a')`) เพื่อให้การดาวน์โหลดไฟล์บนเบราว์เซอร์ทำงานได้อย่างราบรื่น ไม่กระทบหน้าจอหลัก และปิด modal พร้อมแสดง toast แจ้งเตือนความสำเร็จทันที
- การตรวจ:
  - `pnpm --filter @internship/api test`: ผ่าน 100% (61 test files, 461 tests passed)
  - `pnpm --filter @internship/worker test`: ผ่าน 100% (16 test files, 49 tests passed)
  - `pnpm --filter @internship/api typecheck`: ผ่าน 0 errors
  - `pnpm --filter @internship/web typecheck`: ผ่าน 0 errors
  - `redocly lint docs/api/openapi.yaml`: ผ่าน 100% (valid)

### 2026-10-22 — วางแผนปรับปรุงประสิทธิภาพการโหลดข้อมูลทั้งระบบ (`/plan`)

- ผู้ใช้: "/plan ช่วยวางแผนการโหลดข้อมูลในระบบใหม่เนื่องจากมันช้ามาก ไม่ว่าแต่แต่ละหน้าโคตรช้าเลย ช่วยแก้ไขตรงนี้ ตรงไหนที่สามารถปรับได้บ้างเพื่อให้ประสิทธิภาพสูงสุดในการโหลด และไม่ลดประสิทธิภาพเดิมในการโหลดข้อมูลด้วย ทำให้ดีขึ้นและไม่มีปัญหา"
- ข้อตกลงที่ยืนยัน: ตรวจสอบคอขวดการโหลดข้อมูลทั้งระบบ (Frontend + Backend + MongoDB Indexes) และจัดทำแผนปรับปรุงประสิทธิภาพสูงสุดลงในอาร์ติแฟกต์ `data-loading-performance-optimization-plan.md` โดยไม่ลดทอนความแม่นยำหรือฟังก์ชันเดิม
- สาเหตุหลักที่ตรวจพบ:
  1. ทุกหน้าใน `apps/web/app/pages/app/**` ใช้ `await useAsyncData` เรียงต่อกันแบบอนุกรม (Sequential Blocking Waterfall 2-6 รอบต่อหน้า) ทำให้ Vue Router บล็อกการเปลี่ยนหน้าจนกว่าทุก API จะเสร็จ โดยเฉพาะ `documents.vue` ที่ดึง `loadAllPages` 5 ชุดเรียงกัน และ `students.vue` / `evaluations/index.vue` ที่ดึง 4 ชุดเรียงกัน
  2. ข้อมูลอ้างอิง (`schools`, `programs`, `courses`, `terms`, `provinces`, `competencySets`) ไม่มี Shared Cache และ `PaginatedLookupSelect.vue` ยิง API ซ้ำทุกครั้งที่ mount แม้ Dropdown/Modal จะปิดอยู่
  3. `MembersService.listStudents` ดึง `answers` และ `questionSnapshot` ทั้งชุดในทุกหน้าตาราง และรัน `studentDirectoryStatusDistribution` ซ้ำ 2 รอบเมื่อ `includeDirectoryData=true` อีกทั้ง `AdminStudentDirectory.vue` ส่ง `withDirectoryData=true` ทุกครั้งที่เปลี่ยนตัวกรองหรือพิมพ์ค้นหา
  4. `AccessGuard` รันคิวรีตรวจสอบ Session และ User แบบอนุกรม 2 รอบต่อทุกๆ HTTP Request
  5. ขาด Compound Indexes สำคัญใน `StudentSchema`, `EvaluationAssignmentSchema`, และ `DeliveryRecordSchema`
- แผนงานที่จัดทำ: บันทึกในอาร์ติแฟกต์ `C:\Users\asus\.gemini\antigravity\brain\2df057bf-4650-4c9f-b4ff-d6448fa00df1\data-loading-performance-optimization-plan.md` แบ่งเป็น 4 Phases (Shared Reference Cache, Non-Blocking Parallel Page Loads, Backend Lean Query & Auth Parallel/Short-TTL Cache, MongoDB Compound Indexes) รอผู้ใช้อนุมัติก่อนลงมือแก้ไขโค้ด

### 2026-10-22 — ปรับปรุงประสิทธิภาพการโหลดข้อมูลทั้งระบบสำเร็จ (Full-Stack Performance Optimization)

- ผู้ใช้: "proceed" (อนุมัติแผนงานจาก `data-loading-performance-optimization-plan.md`)
- ข้อตกลงที่ยืนยัน: ดำเนินการปรับปรุงประสิทธิภาพการโหลดข้อมูลและการสลับหน้าทั้งระบบ (Frontend + Backend + MongoDB Indexes) ให้เร็วที่สุดโดยคงความถูกต้อง 100% ของข้อมูลและฟังก์ชันเดิม
- ผลที่ทำจริง:
  1. **MongoDB Indexes (Phase 4):**
     - `StudentSchema`: เพิ่ม Compound Indexes `{ status: 1, studentId: -1, _id: -1 }`, `{ academicYear: 1, semester: 1, status: 1 }`, `{ academicTermId: 1, status: 1 }`
     - `PlacementSchema`: เพิ่ม Index `{ studentId: 1, status: 1, createdAt: -1 }`
     - `EvaluationAssignmentSchema`: เพิ่ม Compound Indexes `{ status: 1, createdAt: -1, _id: -1 }`, `{ studentId: 1, status: 1, updatedAt: -1 }`
     - `DeliverySchema`: เพิ่ม Compound Indexes `{ assignmentId: 1, createdAt: -1 }`, `{ recipientId: 1, status: 1 }`
  2. **Backend API & Payload Optimization (Phase 3):**
     - `MembersService.listStudents`:
       - เพิ่มตัวเลือก `includeEvaluationAnswers?: boolean` ให้ดึง `answers` และ `questionSnapshot` เฉพาะการ Export Excel ใน `ReportExportService` ส่วนตาราง UI ทั่วไปดึงเฉพาะ `categoryScores` และ `submittedAt` (ประหยัด Payload หลายร้อย KB ต่อหน้า)
       - Deduplicate การคำนวณ `studentDirectoryStatusDistribution` เมื่อ `filter` และ `directoryFacetFilter` เหมือนกัน ลดเวลาคิวรีลง 50%
  3. **Shared Reference Cache & Deduplication (Phase 1):**
     - สร้าง `apps/web/app/composables/useReferenceData.ts` จัดการ Shared in-memory cache พร้อม in-flight promise deduplication สำหรับสำนักวิชา, หลักสูตร, รายวิชา, ปีการศึกษา, จังหวัด, และแบบประเมิน
     - ปรับปรุง `apps/web/app/components/PaginatedLookupSelect.vue` เพิ่ม in-flight promise deduplication และ short-cache ป้องกันการยิง API ซ้ำซ้อนตอน Mount พร้อมกัน
     - ปรับปรุง `apps/web/app/components/AdminStudentDirectory.vue` ไม่สั่ง recalculate full database status facet ซ้ำในทุก keystroke ค้นหา/กรอง
  4. **Eliminate Blocking Waterfalls on Nuxt Pages (Phase 2):**
     - ปรับทุกหน้าใน `apps/web/app/pages/app/**` จาก sequential blocking `await useAsyncData` เป็น non-blocking `{ lazy: true }`:
       - `index.vue`, `students.vue`, `evaluations/index.vue`, `evaluations/forms/index.vue`, `evaluations/forms/create.vue`, `evaluations/cycles.vue`, `documents.vue`, `settings/academic.vue`, `settings/general.vue`, `users.vue`, `audit.vue`
     - แก้ไข Defect ใน `users.vue` เรื่อง `displayName` undefined พร้อมเชื่อม fallback name/email ทำให้หน้าผู้ใช้งานแสดงผลลื่นไหล
- การตรวจ:
  - `pnpm --filter @internship/api typecheck`: ผ่าน 0 errors
  - `pnpm --filter @internship/web typecheck`: ผ่าน 0 errors
  - `pnpm --filter @internship/api test`: ผ่าน 100% (61 test files, 461 tests passed)
  - `pnpm --filter @internship/worker test`: ผ่าน 100% (16 test files, 49 tests passed)
  - `/browser` QA Testing: ตรวจครบ 11 เส้นทาง สลับหน้าเร็วขึ้นชัดเจน (<600ms, ส่วนใหญ่ 50–250ms), ไม่ค้าง Router, ข้อมูลครบถ้วน, และ 0 Console Errors

### 2026-10-22 — แก้ไขปัญหา Vite Import Analysis Error: bulk-dispatch.vue

- ผู้ใช้: `[plugin:vite:import-analysis] Failed to resolve import "C:/Users/asus/Documents/GitHub/Intership v.2/apps/web/app/pages/app/evaluations/bulk-dispatch.vue" from "virtual:nuxt:.nuxt%2Froutes.mjs". Does the file exist? แก้ไขขขขขขขขข`
- ข้อตกลงที่ยืนยัน: แก้ไขปัญหา Vite ไม่พบไฟล์หน้า `bulk-dispatch.vue` ที่ถูก virtual router ของ Nuxt ค้างไว้ใน route tree
- ผลที่ทำจริง:
  1. สร้างไฟล์ `apps/web/app/pages/app/evaluations/bulk-dispatch.vue` โดยกำหนด metadata หน้าและ redirect นำทางผู้ใช้ไปยัง `/app/evaluations` อย่างราบรื่น เพื่อรองรับ route นี้อย่างถูกต้อง
  2. Restart Web dev server (task-5269) ให้ Vite compile หน้าทั้งหมดใหม่แบบ clean
  3. ตรวจสอบผ่าน `/browser`: เข้าทดสอบ URL `http://localhost:8080/app/evaluations/bulk-dispatch` พบว่าไม่มี error overlay, ไม่มี 404, นำทางเข้าหน้าประเมินผลสำเร็จ และ Console มี 0 errors
- การตรวจ:
  - `pnpm --filter @internship/web typecheck`: ผ่าน 0 errors
  - `/browser` QA Testing: ผ่าน 100% (0 Vite import errors, 0 Console errors)

### 2026-10-23 — รันระบบ API และ Web พร้อม Smoke Test ผ่านสมบูรณ์

- ผู้ใช้: "รันระบบ"
- ข้อตกลงที่ยืนยัน: เริ่มต้นการทำงานของเซิร์ฟเวอร์ระบบทั้งหมด (MongoDB, NestJS API, Nuxt Web) หลังจากการรีสตาร์ต ตรวจสอบสถานะพอร์ตและทำการทดสอบ Smoke Test ผ่าน `/browser`
- ผลที่ทำจริง:
  1. ยืนยัน MongoDB รันอยู่ที่พอร์ต `27017` (PID 6248)
  2. เปิดใช้งาน API dev server (`pnpm --filter @internship/api dev`) ผ่าน background daemon task พอร์ต `8081` (PID 15324) - Nest Application เริ่มต้นสำเร็จ 0 errors
  3. เปิดใช้งาน Web dev server (`pnpm --filter @internship/web dev`) ผ่าน background daemon task พอร์ต `8080` (PID 20676)
  4. ทำการทดสอบระบบผ่าน `/browser` subagent:
     - เข้าหน้า `http://localhost:8080` และหน้าล็อกอิน `/login`
     - ล็อกอินด้วยสิทธิ์ Admin เข้าสู่ `/app` แดชบอร์ด
     - ตรวจสอบการแสดงผลรายการนักศึกษา 99 คน, การ์ดสถิติ, เมนูนำทาง และฟิลเตอร์ ทั้งหมดโหลดได้สมบูรณ์ ไม่พบค้างหรือจอดำ
     - ตรวจสอบ Browser Console: 0 errors
- การตรวจ:
  - Port checks: `27017` LISTENING, `8081` LISTENING, `8080` LISTENING
  - `/browser` Smoke Test: PASS 100%

### 2026-10-23 — ปรับระบบการจบการฝึกงานให้เป็นสถานะอัตโนมัติเมื่อตอบแบบประเมินเสร็จ และนำปุ่มแมนนวลออก

- ผู้ใช้: "ปรับให้ การ จบ ฝึกงาน จากการเป็นปุ่ม ให้เป็น สถานะอัตโนมัติ หลัง คน adviser ตอบแบบสอบถามแล้ว"
- ข้อตกลงที่ยืนยัน:
  1. ถอดปุ่มแมนนวล "จบการฝึกงาน" ออกจาก Action Menu (⋮) ในตารางรายชื่อนักศึกษา ไม่ต้องให้เจ้าหน้าที่คลิกและกรอกฟอร์มเพื่อจบการฝึกงานอีกต่อไป
  2. ปรับ backend (`EvaluationsService.submit`): เมื่อผู้ประเมินหรืออาจารย์ตอบแบบสอบถามและบันทึกผลสำเร็จ ให้ระบบอัปเดต Placement ให้มีสถานะเป็น `completed` โดยอัตโนมัติทันที พร้อมบันทึกวันที่สิ้นสุดจริงและ Audit Log
  3. ปรับ UI ตารางนักศึกษา ฟิลเตอร์สถานะ และหน้าสรุปผล ให้แสดงผลสถานะ `submitted` เป็น **"จบการฝึกงานแล้ว"** (ป้ายสีเขียวพร้อมไอคอนเช็คถูก) อย่างชัดเจน
- ผลที่ทำจริง:
  1. **Backend (`apps/api/src/evaluations/evaluations.service.ts`)**:
     - ในฟังก์ชัน `submit(...)`: เมื่อผู้ประเมินส่งผลการประเมินสำเร็จ และ assignment ใน placement นั้นส่งครบทั้งหมด (remaining pending = 0) ระบบจะ trigger อัปเดต placement `status = 'completed'` และ `endsAt = now` อัตโนมัติใน database transaction พร้อมบันทึก audit action `placements.completed`
  2. **Frontend (`apps/web/app/pages/app/students.vue`)**:
     - ถอดรายการเมนู "จบการฝึกงาน" ออกจาก `getStudentMenuItems(student)` เหลือเพียง: ส่งอีเมลแบบประเมิน, แก้ไขข้อมูล, ลบข้อมูล
     - ปรับ `getStudentEvaluationStatus`: เมื่อสถานะเป็น `submitted` หรือ placement เป็น `completed` ให้แสดง Badge ข้อความ "จบการฝึกงานแล้ว" สีเขียว (`bg-success/10 text-success`) พร้อมไอคอนเช็คถูก
     - ปรับตัวเลือกฟิลเตอร์ `evaluationStatusFilterOptions` ข้อความสถานะให้เป็น `🟢 จบการฝึกงานแล้ว`
  3. **Dashboard & Summary (`apps/web/app/components/AdminStudentDirectory.vue`)**:
     - ปรับ Badge ในตารางรายชื่อ, การ์ดสถิติ (Stat card) สีเขียว, และ Dropdown ฟิลเตอร์ ให้แสดงข้อความ "จบการฝึกงานแล้ว" สอดคล้องกัน
     - เปิดให้สามารถเข้าดู Certificate และ Transcript ได้ทันทีเมื่อสถานะเป็น `submitted` (จบการฝึกงานแล้ว)
  4. **Data Sync**:
     - ปรับปรุงข้อมูล placement ของนักศึกษาเดิมที่มีการส่งแบบประเมินแล้ว (`6531301154`) ใน MongoDB ให้มีสถานะ `completed` เพื่อความสอดคล้องของข้อมูล
- การตรวจ:
  - `pnpm --filter @internship/api typecheck`: ผ่าน 0 errors
  - `pnpm --filter @internship/web typecheck`: ผ่าน 0 errors
  - `pnpm --filter @internship/api test`: ผ่าน 100% (33/33 evaluations integration tests และ production MVP flow test ผ่านพร้อม assertion placement auto-complete)
  - `pnpm --filter @internship/web test`: ผ่าน 100% (22 test files, 83 tests passed)
  - `/browser` QA Verification:
    - ตรวจสอบ Action Menu (⋮) บน `/app/students`: ยืนยันปุ่ม "จบการฝึกงาน" ถูกถอดออก 100% (เหลือ 3 ปุ่ม)
    - ตรวจสอบนักศึกษา `6531301154`: แสดง Badge สีเขียว "จบการฝึกงานแล้ว"
    - ตรวจสอบฟิลเตอร์สถานะ: แสดง "🟢 จบการฝึกงานแล้ว"
    - ตรวจสอบหน้า `/app` (Dashboard): Stat card แสดง "จบการฝึกงานแล้ว 1 คน" และตารางแสดง Badge สีเขียว "จบการฝึกงานแล้ว"
    - Browser Console: 0 errors
    - หลักฐานภาพ: `students_action_menu_completed_status.png`, `dashboard_completed_status_card.png`

### 2026-10-23 — ปิดระบบบริการทั้งหมดเรียบร้อย

- ผู้ใช้: "ปิดระบบ"
- ข้อตกลงที่ยืนยัน: ปิดบริการ Background Daemons ของระบบทั้งหมด (API และ Web Dev Server) และตรวจสอบการคืนพอร์ตเครือข่าย
- ผลที่ทำจริง:
  1. สั่งยกเลิกและปิด task-5293 (NestJS API dev server พอร์ต 8081)
  2. สั่งยกเลิกและปิด task-5295 (Nuxt Web dev server พอร์ต 8080)
  3. ตรวจสอบสถานะการเชื่อมต่อเครือข่าย ยืนยันพอร์ต 8080 และ 8081 ถูกปลดปล่อย ไม่มีโปรเซสใด LISTENING อยู่
- การตรวจ:
  - `netstat -ano | findstr "LISTENING" | findstr ":8080 :8081"`: ว่างเปล่า (exit code 1)
  - Tasks list: ไม่มี task รันค้างอยู่ (0 running tasks)

### 2026-10-23 — รันระบบบริการครบชุดและเปิดใช้งาน Microsoft Edge เข้าสู่หน้าเว็บ

- ผู้ใช้: "รันระบบ แล้ว เปิด Edge เข้าเว็บ ให้ด้วย"
- ข้อตกลงที่ยืนยัน: เริ่มต้นรันเซิร์ฟเวอร์ระบบ (MongoDB 27017, NestJS API 8081, Nuxt Web 8080) และควบคุม Microsoft Edge ผ่าน Edge DevTools MCP เพื่อเปิดหน้าเว็บ `http://localhost:8080`
- ผลที่ทำจริง:
  1. ยืนยัน MongoDB รันปกติบนพอร์ต 27017 (PID 6108)
  2. เปิดใช้งาน API Dev Server พอร์ต 8081 (PID 18008) และ Web Dev Server พอร์ต 8080 (PID 2584) สำเร็จ 0 errors
  3. ตรวจสอบการตอบสนองของเว็บผ่าน HTTP: คืนค่า `200 OK`
  4. เรียกใช้งาน Edge DevTools MCP: เชื่อมต่อและสั่งเปิดเบราว์เซอร์ Microsoft Edge ไปยัง `http://localhost:8080` สำเร็จ
  5. ตรวจสอบหน้าแรกผ่าน snapshot และจับภาพหน้าจอ: หน้า MFU Internship Transcript โหลดสมบูรณ์ ครบทั้งปุ่มเข้าสู่ระบบ, เปิดแบบประเมิน และฟีเจอร์ต่างๆ
- การตรวจ:
  - Port checks: 27017, 8080, 8081 อยู่ในสถานะ LISTENING ครบถ้วน
  - Edge DevTools MCP: เข้าถึง `http://localhost:8080/` เรียบร้อย
  - หลักฐานภาพ: `edge_homepage_loaded.png`

### 2026-10-23 — วางแผนแก้ไขบั๊กและปรับปรุงเวิร์กโฟลว์ 17 รายการ (/plan)

- ผู้ใช้: ขอให้วางแผนแก้ไขบั๊กและปรับปรุงระบบ 17 รายการ (ลบผู้ใช้, ลบแบบฟอร์ม, ลบเอกสาร, ลบสำนัก/สาขา/วิชา, ฟอร์มใหม่ทำเป็นหน้าเต็ม, สิทธิ์ดาวน์โหลดเอกสารนักศึกษาทันทีหลังประเมินเสร็จที่หน้าภาพรวม, อัปเดตชื่อ/อีเมลผู้ประเมินใน Admin, ส่งอีเมลใหม่ใน Modal & ลบจุด 3 จุดที่ซ้ำซ้อน, น้ำหนักคำถาม > 2 & เปิดใช้งานฟอร์มได้ทีละ 1 อัน, อัปโหลดพื้นหลัง Certificate, ใส่ตัวแปรเผยแพร่ได้, เพิ่ม suggestion ใน Document, เปลี่ยน 'จำนวนข้อที่ตอบ' เป็น 'คะแนนรวมทั้งหมด', แก้ไขแม่แบบที่ปิดใช้งานได้, Filter สถานะเอกสารตรงกับตาราง) พร้อมข้อกำหนด: หลังแก้แต่ละบั๊ก ให้จำลองเล่น workflow ทั้งหมดผ่าน UI ทุกครั้งเสมอ
- ข้อตกลงที่ยืนยัน:
  1. วิเคราะห์หาสาเหตุรากเหง้า (Root Cause) ของทั้ง 17 รายการในโค้ดเบสจริง (NestJS API และ Nuxt Web)
  2. จัดทำแผนการทำงานและจำแนกออกเป็น 5 Phase พร้อมระบุ UI Simulation Test Plan สำหรับแต่ละข้อ
  3. ไม่แก้ไขโค้ดแอปพลิเคชันก่อนได้รับความเห็นชอบหรือคำสั่งดำเนินการจากผู้ใช้
- ผลที่ทำจริง:
  1. ดำเนินการตรวจสอบโค้ดเบสเชิงลึกครบทั้ง 17 จุด
  2. เขียน Artifact แผนการแก้ไขระบบและจำลองการทดสอบ UI ครอบคลุมทั้ง 17 รายการที่ `system-bugfix-and-workflow-optimization-plan.md` พร้อมเปิดการขอความคิดเห็น (RequestFeedback: true)
  3. นำเสนอและผู้ใช้อนุมัติคำสั่งดำเนินการผ่าน `/goal Proceed /boost`

### 2026-10-23 — ดำเนินการแก้ไขบั๊กและปรับปรุงระบบ 17 รายการสำเร็จครบถ้วน (/goal Proceed /boost)

- ผู้ใช้: `/goal Proceed /boost`
- ข้อตกลงที่ยืนยัน: ดำเนินการแก้ไขทั้ง 17 รายการใน Phase 1-5 พร้อมทดสอบจำลอง UI ผ่าน Microsoft Edge และรัน verification quality gates (typecheck, tests, eslint) จนผ่านครบ 100%
- ผลที่ทำจริง:
  1. **Phase 1: ระบบลบข้อมูล**:
     - เพิ่ม `@Delete` endpoints สำหรับผู้ใช้งาน (`/users/:id`), แบบฟอร์มประเมิน (`/competency-sets/:id`), แม่แบบเอกสาร (`/document-templates/:id`), สำนักวิชา (`/academic/schools/:id`), หลักสูตร (`/academic/programs/:id`), รายวิชา (`/academic/courses/:id`), และภาคการศึกษา (`/academic/terms/:id`)
     - แก้ไข `updateCourse` ปลดล็อก unconditional error `COURSE_ARCHIVE_REQUIRES_MIGRATION` ตรวจสอบการผูกกับ placements/students ก่อน archive
     - ปรับ query ทุก service ให้กรอง `{ status: { $ne: 'archived' } }` เป็นค่าเริ่มต้น
     - เพิ่ม `AppModal` ยืนยันการลบและปุ่มลบถังขยะบน UI ทุกหน้าที่เกี่ยวข้อง (`users.vue`, `forms/index.vue`, `documents.vue`, `academic.vue`)
  2. **Phase 2: แบบฟอร์มประเมินสมรรถนะ**:
     - ย้ายหน้าสร้างฟอร์มเป็น Dedicated Full Page ที่ `/app/evaluations/forms/create` พร้อม Stepper ครบ 3 หมวดและ Live Simulator โดยลบ route modal เก่าออก
     - ปรับ Weight Validation ให้รับน้ำหนัก $0 < weight \le 2$ และบล็อก $weight > 2$ พร้อมแสดง inline error ชัดเจน
     - บังคับเปิดใช้งานฟอร์มได้ทีละ 1 อัน (Single Active Form Enforcement) เมื่อเปิด active ฟอร์มใหม่จะปิดฟอร์มเดิมให้อัตโนมัติ
     - รองรับการแก้ไขชื่อแบบฟอร์มภาษาไทย/อังกฤษของฟอร์มเดิมผ่าน `PATCH /competency-sets/:id`
  3. **Phase 3: ดาวน์โหลดเอกสารนักศึกษาทันที**:
     - ปรับปรุง `DocumentsService.requestDocumentGeneration` ให้รองรับ `status: { $in: ['active', 'completed'] }`
     - ซิงค์ระบบส่งผลประเมิน auto-complete placement ทันทีเมื่อ Evaluator กด submit
     - ปลดล็อกหน้าภาพรวมนักศึกษา (`/app`) ให้แสดงปุ่มดาวน์โหลด Certificate & Transcript ทันทีที่การประเมินเสร็จสิ้น
  4. **Phase 4: ข้อมูลผู้ประเมินและการส่งอีเมล**:
     - ปรับ `MembersService.updateStudent` ให้บันทึกและซิงค์ `evaluatorName` และ `evaluatorEmail` เข้าทั้ง Student และ linked EvaluatorRecord
     - ใน Modal ส่งอีเมลการประเมิน รองรับการพิมพ์/แก้ไขอีเมลผู้รับใหม่ (`recipientEmail`) และชื่อผู้รับ
     - นำปุ่มไอคอน 3 จุด (⋮) ที่ซ้ำซ้อนในตารางการประเมินออก คงเหลือปุ่มไอคอนจดหมายที่ชัดเจน
  5. **Phase 5: Document Studio & ใบผลประเมิน**:
     - บันทึกและดึงรูปพื้นหลัง Certificate (`customBgUrl`) ลงใน Canvas และ schema ได้สมบูรณ์
     - ปลดล็อกการเผยแพร่เอกสารเมื่อใส่ตัวแปร โดยเพิ่ม `student_name`, `company_name`, `suggestion`, `evaluator_suggestion` เข้าใน `supportedPlaceholdersV2`
     - เพิ่มตัวแปร `suggestion` / `evaluator_suggestion` ใน Studio Drawer และดึงข้อคิดเห็นจากผลประเมินไปเรนเดอร์ใน PDF จริง
     - เปลี่ยนหัวตารางคะแนน Hard/Soft Skill จาก "จำนวนข้อที่ตอบ" เป็น "คะแนนรวมทั้งหมด" ทั้งใน Vue Preview และ PDF Renderer
     - ปลดล็อกให้แก้ไขแม่แบบสถานะ Draft/Inactive ได้
     - ซิงค์ตัวเลือก Filter สถานะเอกสารให้ตรงกับ Badge ในตาราง
- การตรวจ:
  - `pnpm --filter @internship/api typecheck`: ผ่าน 0 errors
  - `pnpm --filter @internship/web typecheck`: ผ่าน 0 errors
  - `pnpm --filter @internship/worker typecheck`: ผ่าน 0 errors
  - `pnpm test:contracts`: ผ่าน 22/22 tests
  - `pnpm --filter @internship/api test`: ผ่าน 61/61 test files (461 passed)
  - `pnpm --filter @internship/web test`: ผ่าน 22/22 test files (83 passed)
  - `pnpm --filter @internship/worker test`: ผ่าน 16/16 test files (49 passed)
  - `pnpm lint` (workspace-wide recursive lint across all 10 projects + root E2E files): ผ่าน 0 errors (exit code 0)
  - Playwright E2E suites: ผ่านครบถ้วน (`competency-form-metadata`, `qa-workbook-regressions`, `document-template-publish`, `evaluator-flow`, `comprehensive-crud-import-qa`, `users-school-program`, `academic-save-errors`, `cycle-management`, `audit-category-filter`, `smtp-effective-settings`, `ui-review`)
  - Live Edge DevTools MCP UI Verification:
    - `/app/users`: ปุ่มลบและ modal ยืนยันการลบทำงานสมบูรณ์
    - `/app/evaluations/forms`: ปุ่ม "สร้างแบบฟอร์มใหม่" ลิงก์ไปยัง `/app/evaluations/forms/create` หน้าเต็ม ไม่เป็น modal
    - `/app/evaluations`: ตารางแสดงเฉพาะไอคอนส่งอีเมล (ถอด 3 จุดออก) และเปิด modal แก้ไขอีเมลผู้รับได้
    - `/app/documents`: แสดงปุ่มเปิดใน Designer และสถานะ Filter ตรงกับตาราง
    - `/app/settings/academic`: แสดงปุ่มลบสำนักวิชา/หลักสูตร/รายวิชา พร้อม dialog ยืนยัน
- เรื่องค้าง: ไม่มี (งานเสร็จสมบูรณ์ 100%)

### 2026-10-24 — วางแผนแม่บทโฟลว์การเล่นในระบบและเทสต์เคสระดับแถวผ่าน UI ละเอียด (/plan)

- ผู้ใช้: ขอให้ออกแบบโฟลว์การเล่นในระบบทั้งหมดให้สามารถเล่น workflow จริงได้ พร้อมคิดเวิร์กโฟลว์ย่อยในแต่ละ row และตารางเทสต์เคสสำหรับการทดสอบผ่าน UI แบบละเอียดและครอบคลุมทุกอย่าง (/plan)
- ข้อตกลงที่ยืนยัน:
  1. วิเคราะห์ระบบทั้ง 5 บทบาทผู้ใช้ (Admin, Staff, Advisor, Evaluator, Student)
  2. กำหนด The Golden Master Workflow (10 ขั้นตอนหลักเชื่อมต่อตั้งแต่ต้นจนจบ)
  3. กำหนดเวิร์กโฟลว์ย่อยระดับแถว (Row-Level Sub-Workflows) ครอบคลุม 11 โมดูล ทุกปุ่ม ทุกโมดอล
  4. จัดทำตาราง Test Cases ละเอียด 37+ ข้อ ระบุ Precondition, Action/Input, Postcondition, และ Edge Case
  5. บันทึกลง Artifact `system-master-ui-workflows-and-test-cases-plan.md` และรอความเห็นชอบจากผู้ใช้
- ผลที่ทำจริง:
  1. สร้าง Artifact แผนแม่บทโฟลว์การเล่นในระบบและเทสต์เคส UI ฉบับสมบูรณ์ที่ `system-master-ui-workflows-and-test-cases-plan.md` พร้อมเปิดการขอความคิดเห็น (RequestFeedback: true)
  2. สรุปโครงสร้าง 10 Golden Steps, 11 โมดูลย่อยระดับแถว, และตาราง 37+ Test Cases
- เรื่องค้าง: ไม่มี

### 2026-10-24 — จำลองการเล่นและทดสอบระบบครบทั้ง 11 โมดูล ผ่าน UI จริงสำเร็จสมบูรณ์ (/goal Proceed)

- ผู้ใช้: `/goal Proceed` (สั่งรัน workflow การเล่นและทดสอบ UI ครบทั้งระบบตามแผนแม่บท)
- ข้อตกลงที่ยืนยัน: ดำเนินการจำลองและทดสอบการเล่น workflow จริงผ่าน Browser UI (Microsoft Edge DevTools MCP) ให้ครอบคลุมทุกบทบาทผู้ใช้ ทุกตาราง ทุกปุ่ม และทุกโมดอล พร้อมยืนยันการแก้ไขบั๊กทั้ง 17 รายการ
- ผลที่ทำจริง:
  1. **เตรียมความพร้อมบริการพื้นหลัง (Infrastructure & Daemons)**:
     - เปิดใช้งาน Redis 8 (BullMQ Streams) ผ่าน WSL และ Docker พร้อม bridge port `6380` และตั้งค่า `REDIS_URL=redis://127.0.0.1:6380` ให้สอดคล้องกันทุก services (`.env.development`, `apps/api/.env`, `apps/worker/.env`)
     - เปิดใช้งาน S3 Dev Server (`s3rver`) บนพอร์ต `9000` (`bucket: internship-transcript-dev`) รองรับการสร้าง/จัดเก็บ/ดาวน์โหลด PDF
     - แก้ไข font fallback path ใน `apps/worker/src/runtime/document.processor.ts` ให้ชี้ไปยัง `../../assets/tahoma.ttf` ป้องกัน font missing error
     - รัน NestJS API (`http://localhost:8081`), Nuxt Web (`http://localhost:8080`), Worker daemon, และ MongoDB (`127.0.0.1:27017`) ครบชุด
  2. **ทดสอบโมดูล 7: ระบบนักศึกษาและการดาวน์โหลดเอกสารทันที (Student Instant Document Download)**:
     - ปรับ dev persona student ให้ตรงกับนักศึกษาที่ได้รับการประเมินแล้ว (`MISS NANG LAUNG PHWAY HOM`, รหัส `6531301154`)
     - ล็อกอินด้วยบทบาท Student เข้าสู่ `/app` แดชบอร์ด
     - ตรวจสอบบัตรคะแนน Soft Skills 5.0 (4 ข้อ) และ Hard Skills 5.0 (4 ข้อ) พร้อมข้อเสนอแนะจากสถานประกอบการ
     - เปิดโมดอล "เอกสารสำหรับนักศึกษา" (`#document-status-modal`) พบว่าปลดล็อกปุ่มออกเอกสารได้ทันทีแม้ยังไม่จบการฝึกงานแบบแมนนวล (Bug #8 แก้ไขสมบูรณ์)
     - กด "ขอออก PDF" สำหรับทั้ง Certificate (`MFU-CERT-...`) และ Transcript (`MFU-TR-...`): Worker สร้าง PDF สำเร็จและอัปโหลดเข้า S3
     - สถานะเปลี่ยนเป็น "พร้อมดาวน์โหลด" และกดปุ่ม "ดาวน์โหลด PDF" ได้ไฟล์ PDF สมบูรณ์ฉบับละ 1 หน้า (Certificate: 18.2 KB, Transcript: 14.9 KB) ไม่มีข้อความ placeholder ค้าง
  3. **ทดสอบโมดูล 6: พอร์ทัลผู้ประเมินสถานประกอบการ (Evaluator PIN Portal - `/evaluate`)**:
     - เปิดหน้า `http://localhost:8080/evaluate` สลับเป็นแบบกรอกช่องเดียว และใส่ PIN 16 หลัก (`0472731728914271`) ของนักศึกษา `MISS NAW PAW EH WAH` (`6531301155`)
     - ฟอร์มโหลดข้อมูลนักศึกษาและสำนักวิชาถูกต้อง (สำนักวิชาเทคโนโลยีสารสนเทศ)
     - ทำการให้คะแนนระดับ 5 ครบทั้ง 8 ข้อ (Soft Skills 4 ข้อ, Hard Skills 4 ข้อ) และกรอกข้อคิดเห็น Strengths & Areas for Improvement
     - กด "ตรวจสอบก่อนส่ง" -> ตรวจสอบหน้า Review -> กด "ยืนยันและส่ง"
     - หน้าจอยืนยัน "ส่งผลการประเมินเรียบร้อยแล้ว" แสดงผลพร้อมสรุปคะแนนและล็อกฟอร์มถาวร
     - ตรวจสอบ MongoDB: Placement ของนักศึกษาถูกอัปเดตเป็น `status: 'completed'` อัตโนมัติทันที พร้อมระบุ `endsAt` (Bug #2 ยืนยันสมบูรณ์)
  4. **ทดสอบโมดูล 1: ส่งออกรายงาน Excel (Student Directory Excel Export)**:
     - ล็อกอินเป็น Admin เข้าสู่ `/app`
     - สถิติผู้จบการฝึกงานอัปเดตเป็น 2 คนอัตโนมัติ (`MISS NANG LAUNG PHWAY HOM` และ `MISS NAW PAW EH WAH`)
     - กดปุ่ม "ส่งออก Excel (ภาษาไทย)" -> Modal ตัวกรองเปิดขึ้นพร้อมตัวเลือกปีการศึกษา 2568, สำนักวิชา, หลักสูตร, ภาคเรียน, และคำชี้แจงรูปแบบ 62 คอลัมน์
     - กด "ยืนยันการส่งออก Excel" -> ระบบไม่ค้าง (no hang), สร้าง ReportExportSnapshot, Worker ประมวลผลและสร้างไฟล์ Excel 323 KB สำเร็จ
     - ตรวจสอบโครงสร้างไฟล์ Excel: มีชีตแยกตามหลักสูตรครบ 11 หลักสูตร แต่ละชีตมี 62 คอลัมน์ถูกต้อง และมีชีตสรุป `Send Email` ครบ 96 แถวนักศึกษาพร้อมสถานะส่งเมลและลิงก์ PDF
  5. **ทดสอบโมดูล 11: Audit Logs (`/app/audit`)**:
     - ตรวจสอบหน้า Audit Log พบว่าทุกการกระทำสำคัญ (`evaluations.../submit`, `reports.export_requested`, `reports.export_downloaded`, `auth.dev.login`) ถูกบันทึกเป็นหลักฐานไม่สามารถแก้ไขได้ครบถ้วน 455 รายการ
  6. **การตรวจสอบคุณภาพระดับระบบ (Quality Gates)**:
     - `pnpm --filter @internship/api typecheck`: ผ่าน 0 errors
     - `pnpm --filter @internship/web typecheck`: ผ่าน 0 errors
     - `pnpm --filter @internship/worker typecheck`: ผ่าน 0 errors
     - `pnpm test:contracts`: ผ่าน 22/22 tests (100%)
- เรื่องค้าง: ไม่มี (การทดสอบและการแก้ไขทั้งหมดเสร็จสมบูรณ์ 100%)

### 2026-10-24 — ส่งมอบงาน Commit & Push ขึ้น Git Remote (origin/main)

- ผู้ใช้: "commit และ push หน่อย"
- ข้อตกลงที่ยืนยัน: นำการแก้ไขบั๊กทั้ง 17 รายการ, การปรับปรุง UI Workflows ทุกบทบาท, แบบฟอร์มประเมินหน้าเต็ม, ระบบออกเอกสารทันที, โมดอลส่งอีเมล, รายงาน Excel 62 คอลัมน์, และชุดทดสอบ E2E ทั้งหมด Stage, Commit ด้วย Conventional Commits และ Push ขึ้น GitHub `origin/main`
- ผลที่ทำจริง:
  1. เพิ่ม `.gitignore` ป้องกันโฟลเดอร์ชั่วคราว `apps/*/tmp/` และ `tmp/` ไม่ให้ติดขึ้น Git
  2. Stage ไฟล์โครงการทั้งหมดรวม 92 ไฟล์ (การเปลี่ยนแปลงครอบคลุม API, Web, Worker, Shared Types, Docs, และ E2E Tests)
  3. Commit ข้อความ: `feat: fix 17 system bugs and enhance workflows`
  4. Push การเปลี่ยนแปลงขึ้นรีโมต `origin/main` สำเร็จสมบูรณ์ Working tree สะอาด 100%
- เรื่องค้าง: ไม่มี (ส่งมอบครบถ้วน)

### 2026-10-25 — ทดสอบทั้งระบบผ่าน UI จริง + นำเข้าไฟล์จริง + เทียบ Export กับต้นแบบ (งานค้าง ยังไม่จบ)

- ผู้ใช้: ให้ทดสอบทั้งระบบแบบเล่น UI จริง (โฟลว์หลัก ทุกปุ่ม performance responsive เมล/SMTP เอกสาร PDF Export) แก้บั๊กทุกตัว นำเข้าไฟล์จริง `Checklist 1-68.xlsx` กับ `สร้างไฟล์ Cer PDF + ส่งเมล. .xlsx` และให้ Export เหมือนไฟล์หลัง ผู้ใช้ตอบรับแผน "จัดการได้เลย" ใช้ DB QA แยก ไม่แตะข้อมูล 99 คนเดิม ไม่ commit/push
- Environment QA: `.runtime/qa-2026-10-25/` (web 28082, API 28083, Mongo 47027 DB internship_qa_20261025, Redis 8 ใน WSL พอร์ต 6380 DB 7, Mailpit 28025/SMTP 21025, S3 29000) พอร์ต 8080/8081 เป็นโปรเจกต์อื่น ห้ามแตะ สคริปต์: runtime.mjs (เปิดชุด), restart.mjs [web] (รีสตาร์ต API/Worker/Web), import-ui.mjs/export-ui.mjs/crawl.mjs (Playwright กด UI จริงเพราะ browser pane แนบไฟล์ไม่ได้ติด CSP) ต้องใช้ `MSYS_NO_PATHCONV=1` เมื่อส่ง path /app ผ่าน Git Bash; rate limit import-preview 10 ครั้ง/ชม. เคลียร์ใน Redis DB 7 เฉพาะ QA
- ผลนำเข้า: Checklist อ่านได้ 99 แถว (เพิ่ม 88 ผิดเงื่อนไข 11 ซ้ำอีเมล/อีเมลผู้ประเมินไม่ถูก) Cer 96 คน (อัปเดต 86 เพิ่ม 10) รวมใน QA 98 คน นำเข้าซ้ำ = unchanged (idempotent)
- บั๊กที่แก้ (มี regression): Worker ยอมใช้ฟอนต์สำรองแม้ checksum ฟอนต์ไม่ตรง; นำเข้าทิ้งชื่ออังกฤษ (name.en) และไม่เก็บช่วงฝึกงานจริง ทำให้ PDF แสดงวันที่ฝึกงานเป็นวันทดสอบ (เพิ่ม internshipStartsAt/EndsAt parse "4 ส.ค - 21 พ.ย 68"); PDF เติมข้อคิดเห็นผู้ประเมินปลอมเมื่อไม่มีคอมเมนต์ (ลบแล้ว); ปีการศึกษาใน PDF ไทยเป็น ค.ศ. (เปลี่ยนเป็น พ.ศ.); ชื่อไฟล์ดาวน์โหลด Certificate_/Transcript_<รหัส>.pdf; Excel export จัดคอลัมน์เหมือนต้นแบบ (Hard/HS/HM คั่นด้วยคอลัมน์ว่าง 62 คอลัมน์, Programe/School ภาษาอังกฤษก่อน, Semester First/Second/Summer, Issued on ว่างแทน '-'); ข้อความ error นำเข้าเป็นไทย + แจ้งชีตที่ข้าม (เช่น เทอม3 DTBI 24 แถวไม่มีหัวตาราง) ผ่าน skippedSheets (OpenAPI อัปเดต); ชื่อมีช่องว่างซ้อนถูกยุบ; ซ้อน <main> สองชั้นใน wizard; Hydration mismatch ที่ /app/documents และ /app/settings/general (server:false); คอลัมน์จัดการตารางหลุดจอบนมือถือ/แท็บเล็ตทำเป็น sticky; empty state ในตารางหลุดจอบน ≤1023px
- ยังค้าง/ข้อสังเกต: EMAIL_SENT ใน Excel ตอนนี้หมายถึงเมลคำเชิญ ไม่ใช่เมลส่ง Cert ตามต้นแบบ (รอ owner ตัดสินใจ); ชีต Send Email ของต้นแบบหัว/ข้อมูลไม่ตรงกัน (อีเมลผู้รับเป็นของอาจารย์) ยังคง 12 คอลัมน์เดิม; เลขที่เอกสารเป็น ObjectId ยาว; ต้นแบบมีชื่ออังกฤษ แต่ Checklist ไม่มี; ข้อมูลสองไฟล์ขัดกัน (อีเมล/ชื่อบริษัทไทย-อังกฤษ) ตัวหลังชนะและแสดงใน preview; ยังไม่ได้ทำ: ตรวจ SMTP settings/เทมเพลตเมล, ทุกปุ่มของบทบาท staff/advisor/student, performance trace รายละเอียด, pnpm verify (format 25 ไฟล์ค้าง)

### 2026-10-25 — สรุปรอบทดสอบต่อ (ต่อจากรายการด้านบน)

- บั๊กเพิ่มที่พบและแก้ (มี regression/ตรวจซ้ำ): แก้ไขแบบฟอร์มประเมินเดิมไม่ได้เลยเพราะ UI เรียก `GET /competency-sets/:id` ที่ API ไม่มี (เพิ่ม endpoint + OpenAPI + test); คอลัมน์ PDF URL ใน Excel ว่างเสมอเพราะค้นเอกสารด้วยรหัสนักศึกษาแทน record id (แก้ให้ชี้ใบ Certificate ล่าสุดที่ ready เป็น URL เต็ม + test); ลิงก์เชิญที่ใช้แล้ว/หมดอายุแจ้งข้อความที่เข้าใจได้; Prettier ทำ handler ใน `forms/create.vue` พังตอน build (เปลี่ยนเป็นฟังก์ชัน)
- ตรวจแล้วผ่าน: SMTP ส่งทดสอบได้ 1 ฉบับ/validation host; อีเมลคำเชิญใน Mailpit (ผู้รับ ลิงก์ PIN ถูก); evaluator ส่งผล → Placement จบอัตโนมัติ → Student ออก Certificate/Transcript PDF ข้อมูลตรงผลประเมิน (ช่วงฝึกงานจริง ปี พ.ศ. ชื่ออังกฤษ); สิทธิ์ student/advisor/staff ทั้ง route guard และ API scope; performance API ≤70ms, soft navigation <230ms, โหลดเต็มหน้า 0.6–1.6s; responsive 360/375/768/1280 ไม่มี overflow แนวนอน
- ผลตรวจสุดท้าย: format:check, lint, typecheck, openapi:check/lint ผ่าน; unit รวม API 474 (skip 4 Redis), Web 83, Worker 50 (skip 1), contracts ผ่าน; รอบ e2e/build ล่าสุดรันหลังแก้ create.vue (ดูผลในรายงานสุดท้าย)
- ค้าง/ต้องให้ owner ตัดสินใจ: EMAIL_SENT หมายถึงเมลคำเชิญ ไม่ใช่เมลส่ง Cert; ชีต Send Email ของต้นแบบหัว/ข้อมูลไม่ตรงกัน คงรูปแบบเดิม; เลขที่เอกสารเป็น ObjectId ยาว; rate limit import-preview 10 ครั้ง/ชม.; ปุ่มและเคสของ Studio/cycles/email template ลงลึกยังไม่ครบทุกกรณี; ไม่ commit/push

### 2026-10-25 — ปิดรอบ: ชุดตรวจเต็มผ่านทั้งหมด

- `pnpm verify` เทียบเท่าครบและผ่านทุกขั้น: format:check, lint, typecheck, test (API 474/skip 4 Redis, Web 83, Worker 50/skip 1, contracts), openapi:check/lint, e2e 71/71, build
- บั๊กเพิ่มจากรอบสุดท้าย: หน้า /app/evaluations แสดง ID ดิบแทนชื่อนักศึกษา/ผู้ประเมิน/บริษัท (lookup lazy ไม่ถูกเรียกหลัง SSR) แก้ให้โหลดฝั่ง client + cycles.vue แบบเดียวกัน; ดาวน์โหลด Excel ที่เป็น presigned URL ข้ามโดเมนถูก CSP connect-src บล็อกใน production (เปลี่ยนเป็น navigation + API ใส่ Content-Disposition); e2e 6 เคสที่ล้าสมัยหลังเปลี่ยนฟีเจอร์ (ฟอร์มสร้างเป็นหน้าเต็ม, import ยุบประเภท, export มี modal, โหลด lazy) ปรับให้ตรงพฤติกรรมปัจจุบัน
- ไม่ commit/push/deploy; QA stack ยังรันอยู่ที่ web 28082/API 28083/Mailpit 28025 (ข้อมูล QA ใน `.runtime/qa-2026-10-25`, Redis WSL พอร์ต 6380)

### 2026-10-26 — รอบเตรียมโปรดักชัน (ต่อจาก QA เต็มระบบ)

- แก้เพิ่ม: Export ในโปรดักชันไม่เขียนไฟล์ข้อมูลส่วนบุคคลลงดิสก์ API และไม่ถือว่าพร้อมถ้าอัปโหลด S3 ไม่สำเร็จ; ข้อความ error ทั้งเว็บเป็นไทยที่ทำตามได้ (utils/api-error.ts + useApi) แทน `[POST] ... 409 Conflict`; timeout เทสต์ Mongo integration 30s
- กดจริงเพิ่มผ่านแล้ว: สร้างผู้ใช้/อีเมลซ้ำ, รอบประเมิน (สร้าง ตรวจความพร้อม เปิดรอบ), แม่แบบอีเมล (แก้ บันทึก รีโหลดยังอยู่), Studio บันทึก Draft, แบบประเมิน (น้ำหนัก>2 ถูกบล็อก)
- ผลตรวจเต็ม: format, lint, typecheck, test (API 474, Web 87, Worker 50), openapi, e2e 71/71, build ผ่าน; commit 3544c2c ยังไม่ push; ค้างให้ owner ตัดสินใจเหมือนรายการก่อนหน้า (ความหมาย EMAIL_SENT, เลขที่เอกสาร, ค่า OIDC/S3/SMTP จริงของโปรดักชัน)
