# ผลแก้บั๊กจากไฟล์ทีมทดสอบ — 2026-10-14

แหล่งข้อมูล: `C:/Users/asus/Downloads/Internship Trarnscript Systems (1).xlsx` งานแก้ใน `C:/Users/asus/Documents/GitHub/Intership v.2` โดยไม่ commit, push, deploy หรือเขียนข้อมูล Production

## ขอบเขตที่ตรวจ

อ่านข้อมูลทุกชีตและทุกแถวเคส: Admin 69, Staff 37, Student 11, Advisor 12, Evaluter 12 รวม 141 เคส มี Fail 9 แถว รวม 8 เคสไม่ซ้ำ เพราะปัญหา Studio `TC-ADM-035` ซ้ำใน Admin และ Staff นอกจากนี้ ID นี้ยังถูกใช้กับเคสรายการผู้ใช้งานที่ Pass จึงต้องอ้างชีต แถว และหัวข้อประกอบ

บัญชีครบ 141 เคสอยู่ใน [workbook inventory](2026-10-14-workbook-inventory.md) ป้าย Pass/Fail ในบัญชีเป็นผลเดิมของทีมทดสอบ ไม่ใช่การอ้างว่าได้รันทุกขั้นตอนของ Excel ซ้ำกับข้อมูลเดิม

ระหว่างเริ่มงานมีอีกแชตเปลี่ยนไฟล์ใน repository ผู้ใช้ยืนยันว่าพักแชตนั้นแล้ว จึงดำเนินการแก้ต่อจากไฟล์ล่าสุด ไม่คืนค่าไฟล์หรือย้อนประวัติ Git

## เคส Fail และการแก้

| เคส / ชีต / แถว                        | สาเหตุที่ยืนยัน                                                                                                           | สิ่งที่แก้และหลักฐาน                                                                                                                                                                                                                                                              |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TC-ADM-005 / Admin / 14                | ฟอร์มเพิ่มนักศึกษาไม่มีชื่อและอีเมลผู้ประเมิน                                                                             | เพิ่มช่อง optional, ส่งชื่อที่ trim และอีเมล lowercase; API ตรวจ email; Playwright ตรวจ POST body จริง                                                                                                                                                                            |
| TC-ADM-009 / Admin / 18                | template ไม่มี evaluator columns, parser ไม่คืนชื่อและไม่รู้จัก `Evaluter Email`; email ผิดถูกทิ้งเงียบ                   | เพิ่มหัวคอลัมน์และปีการศึกษา พร้อม preview รายแถว ส่วนต่าง/ปัญหา และ checkbox ที่ควบคุม payload ก่อน commit; รองรับ camelCase/ไทย/legacy spelling; malformed email เป็น row issue; corrected email มี precedence; Mongo preview→commit ยืนยันข้อมูลคงอยู่และไม่สร้างสิทธิ์/ส่งเมล |
| TC-ADM-017 / Admin / 29                | Simulator อยู่ใน container overflow-hidden แต่ไม่มีพื้นที่เลื่อนของตนเอง                                                  | จัด `flex-1 min-h-0 overflow-y-auto`; modal ส่ง props/UI ให้ Nuxt UI จริง; Playwright ตรวจ scroll ที่ 360/1280 px                                                                                                                                                                 |
| TC-ADM-031 / Admin / 49                | starter ใช้ background ที่ renderer ไม่รองรับ, ภาพไม่มี registered assets, font metadata ไม่มี object จริง และหลาย family | starter ใหม่ใช้ background none, ไม่แทรกตรา/ลายเซ็นที่ไม่มีไฟล์; ใช้ Sarabun พร้อม OFL และ upload bytes จริง; font picker ทำ family ตรงกัน; API publish starter ทั้งสองแบบผ่าน และ Published ยังแก้/เผยแพร่ซ้ำไม่ได้                                                              |
| TC-ADM-035 / Admin / 53 และ Staff / 35 | fullscreen ถูก modal size จำกัด; header/toolbar และสอง sidebar เบียด canvas                                               | ส่ง fullscreen/UI props ชัดเจน, max-w-none, responsive wrapping, scroll ภายใน; มือถือแยกแผง canvas/tools/properties และตรวจ canvas มีพื้นที่เกิน 300 px ใน viewport ทดสอบ; Admin/Staff ผ่านทั้งสองขนาด                                                                            |
| TC-ADM-060 / Admin / 89                | DELETE จังหวัดใช้ hard delete                                                                                             | เปลี่ยนเป็น atomic archive `status: inactive`; คง ID/name/code และ Student province; active picker ไม่แสดงจังหวัด inactive; เปิดใช้งานกลับได้; missing ID ยัง 404; OpenAPI/acceptance/database สอดคล้อง                                                                           |
| TC-STF-018 / Staff / 46                | เอกสาร seed ไม่มี `__v` แต่ CAS ตรวจ `__v: 0` อย่างเดียว                                                                  | School/Program/Term รับ missing หรือ 0 เป็น revision เริ่มต้นและเพิ่มเป็น 1; test real Mongo ตรวจแก้สำเร็จและ race ที่สอง request อ่าน revision เดียวกันต้องชนะหนึ่ง/409 หนึ่ง                                                                                                    |
| TC-EVL-008 / Evaluter / 15             | session guard ปฏิเสธ assignment submitted ก่อนถึง idempotency replay                                                      | ยังคง bound invitation/version/evaluator/expiry/revocation; submitted อ่านผลและ replay key+payload เดิมได้; payload เปลี่ยนหรือ key ใหม่หลัง submit ยัง 409; test guard→service→replay และ revoke ใช้ isolated Mongo                                                              |

## จุดที่พบเพิ่มจาก regression

- การอ่านรายการประเมินเคยสร้าง/หมุน PIN และเผย PIN ผ่าน serialization ปรับให้ GET ไม่เขียนข้อมูล, serialization ปิด PIN/hash ตามปกติ และคืน PIN ที่มีอยู่เฉพาะ `campaigns.send` และขอบเขตของบทบาทที่มีสิทธิ์นั้น โดยไม่ยืม scope จาก Coordinator ที่อ่านอย่างเดียว
- หลังสร้าง document Draft ใหม่ UI ไม่เก็บ `templateStatus` จึงไม่แสดงปุ่มเผยแพร่ ปรับให้ใช้ status ที่ API คืนมา
- Save ระหว่างเตรียมหรืออัปโหลดฟอนต์ทำให้ Draft ไม่มี font key ปรับ guard/disabled และจับ identity ของเอกสารก่อน await เพื่อไม่เลือกฟอนต์ผิดเอกสาร
- การปิดหน้าต่าง import มี handler สองคำสั่งที่ไม่คั่น ทำให้ Vue template compile ไม่ผ่าน แก้ syntax และตรวจ compiler/typecheck/build
- refresh session ที่ล้มเหลวเปลี่ยน API error เป็น Error ใหม่จน status/code หาย ปรับให้คืน error ต้นฉบับ และคง retry เพียงหนึ่งครั้งตาม tests เดิม
- seed ลงทะเบียน metadata ฟอนต์ปลอมและอัปเดต Published เดิม เปลี่ยนเป็น upload licensed bytes ก่อน registration พร้อม checksum/family/rights และ insert-only สำหรับ document templates/versions มี Mongo regression ยืนยัน rerun ไม่เขียนทับฉบับเดิม
- ตัวกรองปีการศึกษาหน้านักศึกษาโหลดเทอม 100 รายการแม้ข้อกำหนด lookup จำกัด 25 ต่อหน้า ปรับ query ให้ตรงขอบเขตเดิม; ไม่เปลี่ยนสิทธิ์หรือเพิ่มการโหลดทั้ง catalog
- ชุด UI review เดิมอ้าง route `/app/correspondence` ที่ไม่มีไฟล์หน้าในโปรเจกต์ ทำให้ 3 บทบาทคาด redirect จากหน้า 404 ผิด ปรับ route inventory ให้ตรงหน้าจริง; หน้า settings/email และสิทธิ์ของทุก route ที่มีอยู่ยังได้รับการตรวจ

## แม่แบบเดิมและความถูกต้องของข้อมูล

ฉบับ Published เดิมและ generated documents ที่อ้างอิงยังคงเดิม ไม่ย้ายฐานข้อมูลและไม่รัน full seed กับฐานข้อมูลผู้ใช้

สำหรับแม่แบบเดิมที่ยังมี unsupported background/ภาพ/ฟอนต์ ให้เปิด Designer → กด **ปรับสำเนาสำหรับ PDF** → ยืนยันรายการเปลี่ยน → บันทึก Draft ใหม่ → เผยแพร่ การปรับสำเนารักษาภาพที่มี asset keys และข้อความอื่นไว้ พร้อมแทน placeholder ชั่วโมงที่ไม่มีแหล่งข้อมูลด้วยข้อความแจ้ง ทั้งในข้อความและช่องตาราง

seed ที่แก้ใช้กับ fresh starter records; rerun ไม่ซ่อม Published เก่าโดยอัตโนมัติ ต้องใช้กระบวนการสำเนาข้างต้น การเปิด PDF จริงยังอยู่ภายใต้ release gates เดิม ไม่ได้อนุมัติเอกสารทางการ ลายเซ็น หรือ Production

Sarabun มาจาก [Google Fonts / Sarabun](https://github.com/google/fonts/tree/main/ofl/sarabun) โดยเก็บ [SIL OFL 1.1](https://github.com/google/fonts/blob/main/ofl/sarabun/OFL.txt) ไว้ข้างไฟล์ใน `apps/web/public/fonts/` SHA-256 ของไฟล์ที่ใช้: `226d4f368fbc0457990ddef2692679badfd2c1a4e89e5ac4d43c10ba7743b2f1`

## แถว Pass ที่หลักฐานยังไม่พิสูจน์ Expected ทั้งหมด

| เคส                     | ความต่างในไฟล์                                   | ข้อสรุป                                                                                                                                   |
| ----------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| ADM008                  | DELETE 204 แต่ Expected open placement ต้อง 409  | ต้องใช้ fixture ที่มี open placement จริง; guard และ regression archive ที่มีงานเปิดยังคงอยู่                                             |
| ADM019                  | 202 แต่ invitation created=false                 | response 202 อย่างเดียวไม่พิสูจน์ invitation; existing campaign/invitation integration tests ตรวจการสร้างและ replay โดยไม่ส่งเมลจริง      |
| ADM029                  | template created=true แต่ draft=false            | starter create/save และ status เผยแพร่ถูกตรวจใหม่ผ่าน UI และ API; ค่าเดิมไม่พิสูจน์ persistence                                           |
| ADM045 / STF017         | create term/course 422 แต่ Expected 201          | workbook ไม่มี payload/error body เพียงพอ; รักษา validation และตรวจ valid academic mutations ไม่ลด validation เพื่อให้ payload ที่ผิดผ่าน |
| ADM052                  | stale SMTP version 422 แต่ Expected 409          | ต้องส่ง payload ที่ผ่าน validation พร้อม stale version จึงทดสอบ conflict ได้; service conflict behavior และ tests เดิมยังคงอยู่           |
| ADM053                  | SMTP test 422                                    | ขาดรายละเอียด configuration ของรอบเดิม; ไม่เปลี่ยน sandbox mail safeguards และไม่ส่งเมลจริง                                               |
| STD007                  | generation ได้ 422 ทั้งสองครั้ง แต่ sameDoc=true | ไม่ใช่หลักฐาน idempotency; document integration tests ใช้ final evaluation/published template ที่ถูกต้องและตรวจ replay จริง               |
| EVL007                  | draft หลัง submit ได้ 401 แทน 409                | session guard fix เปิดทางให้ domain ตรวจ immutable state โดยยังบังคับ invitation binding                                                  |
| EVL009                  | PIN หมดอายุได้ 401                               | เป็นการตรวจ expired credential ต่างจาก authenticated assignment ที่หมด deadline; ไม่เปลี่ยนให้ PIN หมดอายุเข้าสู่ระบบได้                  |
| Coordinator create/edit | workbook บางขั้นตอนคาดสิทธิ์เขียน                | รักษา permissions ปัจจุบันที่ไม่ให้ `students.manage`; ไม่เพิ่มสิทธิ์เพื่อให้ผลตรง test specification ที่ขัด contract                     |

หลายแถวตรวจเพียง GET/smoke หรือข้ามขั้นตอน เช่น ADM028/030/034/038, STF011/012, STD005 จึงไม่อ้างว่าผ่านการรับรองเส้นทางนั้นครบจาก workbook นี้

## Validation

- ชุดทดสอบรวมยืนยัน 634 เคสผ่าน: contracts 22, API 418, Web 82, Worker 46, package tests 66; รอบ `pnpm test` ล่าสุดมี API import timeout 5 วินาทีขณะรันขนาน จึงรัน API ทั้งชุดอีกครั้งด้วย `pnpm --filter @internship/api exec vitest run --maxWorkers=2` ผ่าน 418/418 และ exit 0; suite อื่นผ่านในรอบรวม ไม่อ้างว่าคำสั่งรวมรอบล่าสุด exit 0
- Redis-dependent API 4 และ Worker 1 ถูกข้ามเพราะไม่มี `TEST_REDIS_URL` ไม่ใช้ Redis ที่ผู้ใช้ใช้งานอยู่
- `pnpm typecheck`: ผ่านทั้ง workspace; API typecheck หลังเพิ่ม seed regression ผ่าน
- `pnpm build`: ผ่าน API/Worker/Web production builds; เป็นการ build ในเครื่อง ไม่ใช่ deployment
- `pnpm openapi:check` และ `pnpm openapi:lint`: ผ่านหลัง regenerate client
- Playwright ครบ 61 เคสมีผลผ่านจากรอบรวมและรอบแก้: รอบ `pnpm test:e2e` foundation 1/1 ผ่าน และ browser 57 ผ่าน / 4 ล้มเหลว (query เทอม 1, route เก่าที่ไม่มีหน้า 3); หลังแก้ รัน lookup และสิทธิ์ครบ 6 บทบาทซ้ำผ่าน 7/7, exit 0 ไม่อ้างว่าคำสั่งรวมรอบแรก exit 0
- ชุด workbook ใหม่ทั้ง 10 เคสผ่าน รวม Studio/Simulator 360/1280 px, starter ทั้งสองแบบพร้อม canonical payload/font, manual evaluator contacts และ repair-copy Published; CRUD/import/contact matching ผ่าน 5/5 ในรอบรวม
- scoped ESLint ของไฟล์แก้ผ่าน; mechanical UI detector พบเพียง 4 คำเตือน border decoration ในรูปแบบ certificate เดิมที่อยู่นอกการแก้ layout
- `pnpm verify` ยังไม่ผ่าน baseline formatting/lint เดิมนอกงาน: formatting ในไฟล์เดิม 8 แห่ง และ lint 3 จุด (`randomUUID` ใน campaign/SMTP, `deliveryError` ใน campaign) ไม่อ้างว่า verify ผ่านและไม่ปิดกฎ lint เพื่อผ่าน gate; generated email types ปรับ schema empty string ให้เทียบเท่าด้วย `maxLength: 0` แล้ว ตรวจ client lint ผ่าน

ตรวจรายงานและ observation storage: ไม่มี observation ใหม่เกี่ยวกับสกิล Napus OS; บันทึก checkpoint แล้ว ไม่มีการแก้สกิลหรือเปิด automation เพิ่ม
