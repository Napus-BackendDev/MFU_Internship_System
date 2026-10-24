# แผนทดสอบระบบและ UI ทั้งหมด — 21 ตุลาคม 2026

สถานะ: กำลังดำเนินการ ยังไม่ผ่านเกณฑ์ส่งมอบทั้งระบบ

## ขอบเขตและหลักฐาน

ทดสอบ workflow จริงผ่าน localhost ทุกหน้า ทุกบทบาทที่ระบบรองรับ รวมข้อมูลถูกต้อง ข้อมูลผิด ข้อมูลว่าง สิทธิ์ไม่พอ ข้อมูลข้ามขอบเขต การกดซ้ำ การโหลดใหม่ และบริการล้มเหลว แก้บั๊กที่พบแล้วทดสอบซ้ำ ผล smoke หรือ API จำลองไม่ใช้แทนหลักฐานการทำงานจริงครบเส้นทาง

Environment ใหม่แยกข้อมูลสมมติ: Web18082, API18083, Mongo37027 (`internship_ui_full_20261021`), Redis16389/DB0, S3rver19000, Mailpit18025/SMTP11025 ไม่มีอีเมลออกภายนอก ไม่ใช้ข้อมูลนักศึกษาเดิม 99 คน ไม่ seed/reset ฐานข้อมูลเดิม

## รายการเส้นทางและ workflow ที่ต้องตรวจ

| หน้า                      | เส้นทางหลักและกรณีผิดพลาด                                                                              | สถานะรอบนี้                                            |
| ------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| `/`                       | ทางเข้า ภาษา ลิงก์นักศึกษาและผู้ประเมิน                                                                | รอตรวจ UI                                              |
| `/login`                  | เข้าระบบทุกบทบาท session หมดอายุ ออกจากระบบ เส้นทางต้องห้าม                                            | เข้า Admin จริงแล้ว; ที่เหลือรอตรวจ                    |
| `/evaluate`               | PIN ผิด/หมดอายุ/เพิกถอน เปลี่ยนคน draft/reload submit คำตอบผิดชนิด ไม่ครบ ส่งซ้ำ deadline              | regression เปลี่ยน PIN ผ่าน; workflow จริงรอตรวจซ้ำ    |
| `/app` บุคลากร            | สรุป ตัวกรอง แบ่งหน้า export ไทย/อังกฤษ ดาวน์โหลดและตรวจเนื้อหา                                        | ตรวจ empty state จริงแล้ว; ที่เหลือรอตรวจ              |
| `/app` นักศึกษา           | ผลประเมิน เอกสาร งานคิว ดาวน์โหลด PDF สิทธิ์ข้ามคน                                                     | รอบ 15 ต.ค. ผ่านหนึ่งคน; รอบนี้รอตรวจ                  |
| `/app/students`           | สร้าง/แก้/archive นำเข้า preview mapping แถวผิด/ซ้ำ ผู้ประเมิน สถานประกอบการ เชิญ/เชิญซ้ำ จบ placement | รอตรวจ UI รอบใหม่                                      |
| `/app/evaluations`        | filter/detail คะแนน ข้อมูลไม่ครบ ปิด placement วันที่จริง/reason/revision และ audit                    | รอตรวจ UI                                              |
| `/app/evaluations/forms`  | draft/คำถาม/คะแนน/preview/publish immutable duplicate/archive                                          | รอตรวจ UI                                              |
| `/app/evaluations/cycles` | create/edit reference ผิด วันผิด เปิด/ปิด revision เก่า                                                | รอตรวจ UI                                              |
| `/app/documents`          | template draft studio assets/font preview publish/archive generate/retry PDF                           | รอตรวจ UI                                              |
| `/app/users`              | create/edit role/scope school/program สถานะ ตัวกรอง แข่งขันคำขอ                                        | พบ hidden program ค้างจริง; แก้และกำลังตรวจ regression |
| `/app/audit`              | scope Request ID หมวด Action แบ่งหน้า total/error/retry                                                | พบข้อสงสัยกรองเฉพาะหน้าปัจจุบันจากโค้ด; ยังไม่แก้      |
| `/app/settings/academic`  | school/program/course/term create/edit/archive reference ที่ถูกใช้งาน                                  | รอตรวจ UI                                              |
| `/app/settings/general`   | ตั้งค่า province ข้อมูลผิด/ซ้ำ/archive persistence                                                     | รอตรวจ UI                                              |
| `/app/settings/email`     | draft variable/preview/publish active/archive                                                          | API regression ตัวแปรผิดรูปแบบผ่าน; UI รอตรวจ          |
| `/app/settings/smtp`      | capture config invalid validation ทดสอบส่ง queue/recovery ห้ามส่งจริง                                  | รอตรวจ UI                                              |
| `/app/support`            | คำแนะนำสอดคล้อง workflow ลิงก์ ภาษา keyboard/mobile                                                    | รอตรวจ UI                                              |

ทุกหน้าที่อนุญาตตรวจ Admin, Staff, Advisor, Student, Evaluator, Auditor ตาม permission จริง บทบาทที่ไม่อนุญาตต้องถูกปฏิเสธจาก API ด้วย ตรวจ desktop/mobile, ภาษาไทย/อังกฤษ, ธีม และ keyboard กับจุดที่เปลี่ยน ไม่ถือว่า render ผ่านเท่ากับ workflow ผ่าน

## บั๊กและผลตรวจที่ยืนยันแล้ว

1. คำตอบข้อความของนักศึกษา A ค้างเมื่อเปลี่ยน PIN ไป B: regression ล้มเหลวก่อนแก้ด้วยข้อความส่วนตัว A ปรากฏใน B แก้ล้าง state และกันผลตอบกลับ async เก่า รวม snapshot คำตอบขณะส่ง Regression หลังแก้ผ่าน 1/1 ยังต้องตรวจจริงกับสอง assignment
2. แม่แบบอีเมลยอม publish ตัวแปร `student_name1`, `Student_Name`, `student-name`, `ชื่อ`: regression ล้มเหลวครบ 4 กรณีก่อนแก้ ขยาย parser ให้ตรวจ unknown placeholder ทุกแบบ ชุด integration หลังแก้ผ่าน 11/11
3. Users เลือก IT/SE แล้วเปลี่ยน LAW: UI แสดงทุกหลักสูตร แต่ DOM input ยังมี program ID เดิม แก้ล้าง program เฉพาะการเลือก school ของผู้ใช้ ไม่ล้างตอนเปิดข้อมูลแก้ไข พร้อมเพิ่มชื่อ accessible ให้สองช่อง Regression ผ่าน
4. Users มีคำขอโหลดซ้อนกันโดยไม่มีลำดับ: เพิ่ม sequence guard กัน response/error/loading เก่าเขียนทับคำขอใหม่ ยังต้องมี regression แข่งขันคำขอและตรวจ UI

5. Audit category กรองเฉพาะหน้าปัจจุบัน: regression ก่อนแก้ได้ total9 แทน1 แก้ query `actionCategory` ที่ API ก่อน pagination/count โดยรักษา scope พร้อม OpenAPI/client และ UI labels ตาม HTTP method ชุด Audit integration/controller/service ผ่าน11/11 และ Browser filter ผ่าน
6. Support FAQ อธิบาย Access Token แทน PIN และไม่บอกขั้นตอน completion: ยืนยันข้อความบน UI จริงแล้ว แก้คำแนะนำ PIN16หลักและการยืนยันวันจบก่อนออก Transcript ช่องทางติดต่อที่ยังไม่ยืนยันไม่ได้แต่งข้อมูลใหม่
7. นำเข้า Excel แจ้งเลขแถวเกินจริง1แถว: ไฟล์จริงข้อมูลเริ่มแถว2แต่previewแจ้ง3 เพิ่ม regressionทั้งกรณีมี/ไม่มีแถวว่างนำหน้าและแถวว่างกลาง แก้ใช้ตำแหน่งแถวจริงโดยเริ่มrange0
8. Preview ชื่อไทยนักศึกษากลายเป็นชื่อผู้ประเมินในเทมเพลตที่ดาวน์โหลดจากUI: ยืนยันก่อนแก้ด้วยไฟล์จริงและregression แก้การจับหัวคอลัมน์กว้างเกินไป ข้อมูลชื่อที่บันทึกในทะเบียนสองคนยังถูกต้อง ไม่ได้อ้างว่าข้อมูลทะเบียนเสีย
9. อีเมลนักศึกษาว่าง/ผิดแต่มีอีเมลผู้ประเมิน จะผ่านvalidationโดยใช้อีเมลผู้ประเมินแทน: regressionล้มเหลวสองกรณีก่อนแก้ เลิกค้นอีเมลจากช่องอื่นโดยพลการ รักษากรณีlegacyคอลัมน์เลื่อนที่รองรับโดยเฉพาะ ชุด parser/import integrationล่าสุด38/38ผ่าน APIรวมล่าสุด454/454ผ่าน
10. Commitสองแถวถูกจากไฟล์สี่แถวแสดงcompleted50%: ยืนยันUIจริง แก้ตัวหารเป็นจำนวนที่ผู้ใช้ยืนยัน พร้อมเพิ่มregressionไฟล์ผสมถูก/ผิด
11. Toastที่ถูกaria-hiddenหลังmodalเปิดทับปุ่มcommit/close: Browserรวมล้มเหลวที่clickและมีtraceระบุtoastintercepts pointer events แก้ใช้สถานะผลตรวจ/สำเร็จในmodalและerrorbannerค้างพร้อมวิธีแก้ แทนtoastซ้ำที่ทับปุ่ม เพิ่มกรณีretryไฟล์หลัง422

## หลักฐาน workflow จริงรอบนำเข้า

ดาวน์โหลดเทมเพลตจากUI แล้วสร้างไฟล์สมมติ `qa-mixed-students.xlsx` ภายใต้ `.runtime/full-ui-2026-10-21/fixtures/` จากหัวตารางเดียวกัน มีนักศึกษาถูกต้อง6631503016/6631503017สองคน แถวอีเมลผิดและสำนักUNKNOWNอีกสองแถว Previewปิดcheckboxสองแถวผิด Commitเฉพาะสองแถวถูกแล้วทะเบียนแสดงสองคนพร้อมชื่อ/อีเมล/IT/SE/1301493/2026เทอม1/บริษัท/จังหวัด/ผู้ประเมินถูกต้อง

กดส่งคำเชิญเมื่อขาดอาจารย์ ระบบปฏิเสธพร้อมรายการข้อมูลขาดและปุ่มไปแก้ไข กรอกอาจารย์สมมติของ6631503016แล้วสถานะพร้อมส่ง ส่งคำเชิญผ่านUIเข้าMailpitสำเร็จหนึ่งฉบับ ตรวจเนื้อหาชื่อ/รหัส/บริษัท/ผู้ประเมิน/deadline/PINจากอีเมลจริง ไม่ส่งภายนอก หลักฐานภาพทะเบียน `.runtime/full-ui-2026-10-21/import-students-real.png`

เปิดลิงก์อีเมลพบ500 `Cannot find module ...evaluate-JGD_MMem.mjs` เพราะบริการWebที่รันอยู่ยังจำชื่อchunkจากbuildเก่า หลังผู้ใช้สั่ง“ทำยังไงก็ได้ให้เปิดได้” ตรวจparent14320และเจ้าของพอร์ตตรงPID12864/26236ก่อนหยุดเฉพาะสองprocessได้ผ่านคำสั่งที่จำกัดเป้าหมายกว่าเดิม ไม่หยุดฐานข้อมูล/Redis/Worker/Mailpit เปิดAPIbuildล่าสุดPID8520แล้ว Webกำลังbuildก่อนเปิดใหม่ ต้องยืนยันเส้นทางจริงหลังเปิดอีกครั้ง

Browser regression รวม Evaluator/Users/Audit ผ่าน9/9 โดยใช้ API จำลอง Web/API typecheck, OpenAPI check และ build ผ่านก่อนแก้ข้อความ Support ล่าสุด รอบ verify รวมผ่าน format/lint/typecheck และ API449/449, Web82/82, Worker50/50 โดยเปิด Redis test ที่16389/DB14 ไม่มี skipped ในสามแอปนี้ ขณะบันทึกกำลังรัน E2E รวม ห้ามสรุปว่าทั้งระบบผ่านจากผลย่อยข้างต้น

คำสั่งรีสตาร์ตครั้งแรกถูก automatic approval policy ปฏิเสธโดยไม่มีเหตุผลเฉพาะ ภายหลังผู้ใช้สั่ง“ทำยังไงก็ได้ให้เปิดได้” ใช้คำสั่งที่ตรวจparentและเจ้าของพอร์ตก่อนหยุดเฉพาะบริการQAได้สำเร็จ เปิดAPI8520/Web5744จากbuildล่าสุดแล้ว ข้อมูลเดิมสองคนและอีเมลในMailpitยังอยู่

## ลำดับตรวจต่อ

`pnpm verify` รอบรวมจบ63/64Browserเคส เคสimportล้มเหลวเพราะtoastทับปุ่ม หลังแก้รันไฟล์CRUD/import/retryใหม่ผ่าน4/4 แต่ยังไม่อ้างว่าคำสั่งverifyรวมexit0บนrevisionสุดท้าย APIรวมล่าสุด454/454, format/APIscopedlint/Weblint/APItypecheck/Webtypecheck/APIbuild/Webbuildผ่าน ไม่มีtestprocessค้างจากรอบนี้

ผลหลังเปิดWebPID5744: reloadแท็บลิงก์อีเมลแล้วเปิดฟอร์มAได้ ไม่พบ500 มีเฉพาะSoft4ข้อ/HardIT4ข้อ/คำแนะนำ2ข้อ กดส่งโดยไม่ตอบครบถูกปฏิเสธพร้อมชื่อข้อบังคับ บันทึกคะแนนข้อแรก4และคำแนะนำสมมติเฉพาะAเป็นDraftแล้วreload ข้อมูลกลับมาครบ หลักฐาน `.runtime/full-ui-2026-10-21/evaluator-opened-after-restart.png` ยังไม่submitfinalเพื่อใช้ตรวจการแยกข้อมูลระหว่างA/Bต่อ

ลำดับต่อ: ตรวจ Users/Audit จริงหลังแก้และนำเข้าไฟล์เดิมยืนยันunchanged/เลขแถว/ชื่อ จากนั้นส่งคำเชิญนักศึกษาB ทดสอบเปลี่ยนassignmentจริงสองคน แล้ว master data, completion, documents/export และบทบาทที่เหลือ พร้อม error/recovery

ตรวจเพิ่มเติมบน UI จริง: หน้า Support แสดงชัดเจนว่าฟอร์มยังไม่มี backend และปุ่มส่งถูกปิด; กลับหน้าสรุปแล้วกด export ภาษาไทยขณะมีนักศึกษา0คน ระบบแสดง “ไม่มีข้อมูลสำหรับส่งออก” และแนะนำปรับตัวกรอง ไม่สร้างไฟล์ว่างหลอกผู้ใช้

## สถานะล่าสุดหลังเล่น workflow A/B จริง — 21 ตุลาคม 2026

ตรวจ assignment isolation ด้วยข้อมูลจริงใน QA แล้ว: A มี Draft คะแนน4หนึ่งข้อ/ข้อความเฉพาะA เปลี่ยน PIN ไป B พบ checked radio0และtextareaว่างทั้งสอง บันทึก B คะแนน3ครบ8ข้อ/ข้อความBแล้วกลับA DraftAยังอยู่เดิม ส่งfinalAครบ8ข้อเป็น4และreloadพบreviewล็อก/ไม่มีradioแก้ไข จากนั้นทดสอบPIN0000000000000000ถูกปฏิเสธแบบgeneric และPINBที่ถูกต้องกู้DraftBครบ8ข้อเป็น3 ส่งfinalBสำเร็จ ข้อความไม่ปนกัน หลักฐาน assignment-b-empty-after-a.png และstudent-b-final-review.png ใน.runtime/full-ui-2026-10-21

Auditจริง: จากทั้งหมด34รายการ หน้าแรก5แถวไม่มีPATCH แต่เลือกPATCHพบ4รายการรวมเหตุการณ์เก่า กรองRequestIDจริงร่วมกันเหลือ2แถวและresetกลับ34 ยอด/การแบ่งหน้าตรงกัน ภายหลังขยายAuthcategoryให้รวมpublic PIN verificationและinvitation exchangeด้วย regressionก่อนแก้พบขาดสองroute หลังแก้APIรวมผ่าน ตรวจUsersจริงเลือกIT/SEแล้วเปลี่ยนLAW hiddenprogramเป็นค่าว่าง หลักฐานaudit-real-filter.pngและusers-school-program-cleared.png

นำเข้าไฟล์เดิมจริงพบphantomdiffภาคเรียน1กับภาคการศึกษาต้น เพิ่มregressionก่อน/หลังและnormalizeเฉพาะการเปรียบเทียบ ไม่migrateข้อมูล ไม่ผ่อนCAS ตรวจเทอมต่างจริงยังเสนอupdate หลังrestartAPIตรวจUIซ้ำพบunchanged2/invalid2 ไม่มีcreate/update ปุ่มcommit0ถูกปิด ชื่อ/เลขแถวถูกต้อง หลักฐานreimport-unchanged-real.png

จบplacementAผ่านUIด้วยactualend2026-10-21T14:00Asia/Bangkokพร้อมเหตุผล ก่อนหน้านั้นทดสอบวันอนาคตถูกbackendปฏิเสธแต่UIอ่านerrorenvelopeผิด แก้data.error.codeและข้อความdate/stale/incomplete พร้อมBrowserregression3/3ผ่าน Bยังไม่complete

Studentจริงพบdefaultdevelopmentloginส่งemail6631503016แต่scope.studentId6531501009 ทำให้โหลดข้อมูลไม่ได้ แก้เป็น6631503016แล้วloginใหม่โหลดข้อมูล/Soft4.0/Hard4.0/ข้อความAได้ครบ ไม่เห็นคะแนน3ของB เล่นguide3ขั้น พบข้อความWord/Referralเก่า แก้เป็นPDF Certificate/Transcriptและขั้นกดสถานะเอกสาร พร้อมเงื่อนไขcomplete/published template

**PDFยังไม่ผ่านส่งมอบรอบนี้:** StudentAขอCertificate/Transcriptผ่านUI งานWorkerreadyและดาวน์โหลดจริง แต่ตรวจเนื้อหาและภาพพบCertificateเพียงชื่อ ไม่มีรหัส/ช่วงฝึกงาน; Transcriptเป็นหนังสือส่งตัวเพียงชื่อ ต้นเหตุseedเผยแพร่แม่แบบไม่ครบ/ผิดประเภท หลักฐานcertificate-incomplete-before.pdf, transcript-wrong-before.pdf/.png, pdf-validation-latest.json และstudent-documents-ready.png เก็บไว้ ไม่ส่งไฟล์เหล่านี้เป็นผลสำเร็จ

แก้seed sourceให้ใช้createDevelopmentDocumentTemplateซึ่งมีstudentID/name/school/program/company/period/docnumber/issuedateและตารางผลประเมินTranscript มีcontract2เคสและimmutable-seed integrationเดิมผ่าน ไม่rerunseed ไม่แก้PublishedเดิมในDB สร้างDraftใหม่ผ่านUIชื่อQA Transcript ครบข้อมูล 2026-10-21, master6ad87305cf153c04c593b4bf/version6ad87305cf153c04c593b4c0 ยังdraftจากreadonlyDBcheck

หน้าต่างnativeconfirmเผยแพร่ในแท็บ2ค้าง เครื่องมือgetJsDialogไม่พบdialogแต่ทุกaction/AX/close/EscapeติดEmulation.setFocusEmulationEnabled timeout ถามผู้ใช้ให้กดยกเลิก คำถามยังรอคำตอบ พยายามแท็บใหม่5อ่านHTMLได้แต่กดloginไม่มีผล จึงแก้ข้อความความคืบหน้าที่เคยกล่าวว่ากู้ได้ให้ตรงว่าinputยังถูกdialogเก่าบล็อก ห้ามถือว่าเปิดแท็บใหม่แก้ข้อขัดข้องแล้ว

แก้Studio publish/repair/discardใช้AppModal confirmationแทนwindow.confirm มีcancel/confirmและcleanupPromiseตอนunmount เพิ่มz-indexสำหรับmodalซ้อน ทดสอบpublishAdmin/Staff+repairหลังแก้layer3/3ผ่าน ชุดเดิมอีก11เคสผ่านก่อนlayerfix แก้previewacademic_yearและข้อความPDFปิดที่ไม่ตรงพฤติกรรม BuildWebล่าสุดผ่านและเปิดWebPID18640/API9136 ข้อมูลQAเดิมครบ metadataprocesses.json APIรวมล่าสุด458/458ผ่าน ไม่มีRedisskip, APIbuild/typecheck, Webbuild/typecheck/lint, scopedlint/OpenAPIcheck/formatผ่าน ไม่มีtestprocessรออยู่ ไม่อ้างpnpmverifyรวมexit0

งานต่อเร่งด่วน: ปลดnativeconfirmเก่าด้วยยกเลิก/ตรวจสถานะแท็บหลังcleanup แล้วreloadใช้Studiobuildใหม่ เปิดDraftTranscriptเดิมpublishผ่านAppModal สร้างCertificateใหม่จากstarterครบข้อมูลและpublish ขอออกPDFใหม่ทั้งสองแบบผ่านStudent ตรวจname/id/date/คะแนน4/ไม่มีข้อความB/ไม่มีplaceholderและlayoutใหม่จริง ต่อmasterdata/roles/settings/email/recovery/exportตามขอบเขตเต็ม เป้าหมายยังactive ไม่มีcommit/push/deploy

## อัปเดตจริงหลังผู้ใช้ปิด dialog — 21 ตุลาคม 2026 16:20

Transcript เดิม published แล้ว; สร้าง Certificate ครบผ่าน UI/AppModal ได้ กำหนดแม่แบบหลักทั้งสองแบบ เก่า archived เพิ่ม source matching ตาม templateVersionId เพื่อให้ขอฉบับใหม่ได้โดยไม่ลบไฟล์เก่า Utility6/6/typecheck/buildผ่าน ขอ/ดาวน์โหลดใหม่จริง Certificate(4).pdf10945bytes/Transcript(5).pdf11774bytes ทั้งหนึ่งหน้า ตรวจข้อความ+ภาพครบ ชื่อเอ/6631503016/บริษัทQA/20–21Oct2569 Transcript4.0ทั้งสองหมวด4ข้อ ไม่มีB/Referral/placeholder หลักฐานcertificate-complete._,transcript-complete._,pdf-complete-validation.json,student-documents-new-ready.png

StaffจริงกรองAและส่งออกTH/EN พบบั๊กไฟล์คะแนน/สถานะว่างเพราะบังคับcyclefilterเก่า และadvisorอ่านfieldเก่า แก้mappingใช้uniqueassignmentเมื่อไม่ระบุcycle/ไม่สุ่มmultiple พร้อมadvisorName/siteVisitAdvisorName Regressionก่อนแก้ล้ม2/หลังผ่าน5/5 APIbuildผ่าน ล่าสุดAPI32260/Web26184 ส่งออกUIใหม่ TH/EN (2).xlsx ตรวจXMLครบ1คน คะแนน4.0หมวดละ4 ผู้ประเมิน/email/อาจารย์ถูกต้อง export-verified.json

StaffปิดB: วันที่อนาคต22Octถูกปฏิเสธและข้อความUIตรงแล้ว จากนั้นactualEnd21Oct15:00Bangkokพร้อมreasonสำเร็จ เมนูจบแล้วdisabled completion-future-rejected.png ยังมีบั๊กเลขที่เอกสารหายเฉพาะpollreadyก่อนreload(listมี/detailไม่มี) รอแก้ ไม่ถือว่าUIทั้งหมดครบ

## รอบข้อมูลหลักและชุดภาพ — 21 ตุลาคม 2026

แก้ Academic save error เป็น inline และแปล duplicate/changed/permission/retry; แก้ Program filter ทำCourse lookup/countผิด ใช้Programreferenceครบหน้าและไม่เทียบจำนวนเพื่ออ้างทุกหลักสูตร E2Eจำลอง2/2ผ่าน typecheck/lint/Webbuildผ่าน UIจริงSchoolcreate/edit/reload/empty/duplicate, Programcreateผ่าน รายวิชาหลังbuildแสดงENG/TLC/AC/BIO/MATEถูกต้อง APIเพิ่มgetDocumentViewคืนtype/numberตรงlistโดยรักษาredaction ชุดdocument+export36/36/APIbuildผ่าน ยังไม่ทดสอบpollreadyเลขที่กับงานใหม่จริง

ผู้ใช้เปลี่ยนความสำคัญให้เก็บภาพทุกหน้าโทนสว่างและเสริมModal ภาพ74ไฟล์ครบ16route แยกPublic4/Admin21/Staff10/Advisor5/Student6/Modals28 ที่Pictures/Screenshots/Internship-Light-2026-10-21 มีgallery/manifest/imagechecksและZIP ตรวจรูปเปิดได้74และZIPCRCผ่าน รายละเอียดหน้าต่างที่QAปัจจุบันเปิดไม่ได้ระบุในgallery ไม่ถือว่าการแคปทุกหน้าเท่ากับทดสอบทุกworkflowผ่าน ยังไม่ผ่านส่งมอบQAทั้งระบบ RuntimeWeb35264/API25856
