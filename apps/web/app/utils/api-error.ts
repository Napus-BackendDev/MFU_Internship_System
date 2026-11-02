// Turns an API failure into a message a person can act on, instead of the raw
// `[POST] "/api/v2/users": 409 Conflict` text that $fetch puts in Error.message.
const CODE_MESSAGES: Readonly<Record<string, string>> = {
  USER_EMAIL_EXISTS: 'อีเมลนี้มีผู้ใช้งานอยู่แล้ว กรุณาใช้อีเมลอื่น',
  PERMISSION_DENIED: 'คุณไม่มีสิทธิ์ดำเนินการนี้',
  RESOURCE_NOT_FOUND: 'ไม่พบข้อมูลที่ต้องการ อาจถูกลบหรือย้ายไปแล้ว',
  VERSION_CONFLICT:
    'ข้อมูลถูกแก้ไขโดยผู้อื่นก่อนหน้านี้ กรุณารีเฟรชแล้วลองใหม่',
  IDEMPOTENCY_KEY_REUSED: 'คำขอนี้ถูกใช้ไปแล้วด้วยข้อมูลอื่น กรุณาลองใหม่',
  TEMPLATE_CODE_ALREADY_EXISTS: 'รหัสแม่แบบนี้มีอยู่แล้ว กรุณาใช้รหัสอื่น',
  PUBLISHED_VERSION_IMMUTABLE:
    'ฉบับที่เผยแพร่แล้วแก้ไขไม่ได้ กรุณาโหลดแม่แบบใหม่แล้วบันทึกเป็น Draft',
  PUBLISHED_VERSION_REQUIRED:
    'แม่แบบนี้ยังไม่มีฉบับที่เผยแพร่ กรุณาบันทึกและเผยแพร่ก่อนเปิดใช้งาน',
  DOCUMENT_TEMPLATE_INVALID:
    'แม่แบบมีองค์ประกอบที่ระบบไม่รองรับ เช่น ตัวแปรที่ไม่รู้จักหรือองค์ประกอบหลุดขอบกระดาษ กรุณาตรวจแล้วบันทึกใหม่',
  DOCUMENT_FONT_MAPPING_UNSUPPORTED:
    'แม่แบบใช้ฟอนต์ได้เพียงแบบเดียว กรุณาเลือกฟอนต์เอกสารใหม่แล้วบันทึกอีกครั้ง',
  DOCUMENT_FONT_ASSET_NOT_REGISTERED:
    'ยังไม่ได้เลือกฟอนต์เอกสารที่ลงทะเบียนแล้ว กรุณาเลือกฟอนต์ก่อนเผยแพร่',
  FONT_ASSET_NOT_FOUND: 'ไม่พบไฟล์ฟอนต์ในพื้นที่จัดเก็บ กรุณาอัปโหลดฟอนต์ใหม่',
  DOCUMENT_PLACEHOLDER_SOURCE_UNAVAILABLE:
    'แม่แบบใช้ตัวแปรที่ระบบยังไม่มีข้อมูล เช่น จำนวนชั่วโมงรวม กรุณาลบตัวแปรนั้นก่อนเผยแพร่',
  DOCUMENT_IMAGE_ASSET_REQUIRED:
    'มีตราหรือลายเซ็นที่ยังไม่ได้เลือกรูป กรุณาเลือกรูปหรือลบองค์ประกอบนั้น',
  DOCUMENT_IMAGE_ASSET_NOT_REGISTERED:
    'รูปที่เลือกไม่อยู่ในคลังแล้ว กรุณาอัปโหลดรูปใหม่',
  DOCUMENT_IMAGE_ASSET_TYPE_MISMATCH:
    'รูปที่เลือกไม่ตรงประเภทการใช้งาน กรุณาเลือกรูปใหม่',
  DOCUMENT_IMAGE_ASSET_NOT_FOUND:
    'ไม่พบไฟล์รูปในพื้นที่จัดเก็บ กรุณาอัปโหลดรูปใหม่',
  DOCUMENT_BACKGROUND_ASSET_REQUIRED:
    'ยังไม่ได้อัปโหลดภาพพื้นหลัง กรุณาอัปโหลดภาพหรือเลือกพื้นหลังแบบอื่น',
  DOCUMENT_BACKGROUND_RENDERER_UNSUPPORTED:
    'ระบบยังไม่รองรับพื้นหลังแบบนี้ กรุณาเลือกพื้นหลังแบบอื่น',
  DOCUMENT_ASSET_CONTENT_INVALID:
    'ไฟล์รูปไม่ถูกต้อง รองรับรูปขนาดไม่เกิน 4096 × 4096 พิกเซล',
  DOCUMENT_ASSET_SIZE_INVALID: 'ไฟล์ต้องมีขนาดไม่เกิน 8 MB',
  DOCUMENT_ASSET_STORAGE_UNAVAILABLE:
    'พื้นที่จัดเก็บไฟล์ไม่พร้อมใช้งาน กรุณาลองใหม่อีกครั้ง'
}

const STATUS_MESSAGES: ReadonlyArray<readonly [number, string]> = [
  [400, 'ข้อมูลที่ส่งไม่ถูกต้อง กรุณาตรวจสอบแล้วลองใหม่'],
  [401, 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่'],
  [403, 'คุณไม่มีสิทธิ์ดำเนินการนี้'],
  [404, 'ไม่พบข้อมูลที่ต้องการ'],
  [409, 'ข้อมูลขัดแย้งกับรายการที่มีอยู่แล้ว กรุณาตรวจสอบแล้วลองใหม่'],
  [413, 'ข้อมูลที่ส่งมีขนาดใหญ่เกินไป กรุณาลดขนาดไฟล์หรือเนื้อหาแล้วลองใหม่'],
  [422, 'ข้อมูลไม่ผ่านการตรวจสอบ กรุณาแก้ไขแล้วลองใหม่'],
  [429, 'ทำรายการบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่']
]

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

export function friendlyApiMessage(error: unknown): string | undefined {
  const source = record(error)
  if (!source) return undefined
  const status = Number(source.status ?? source.statusCode)
  const data = record(source.data)
  const body = record(data?.error) ?? data
  const code = typeof body?.code === 'string' ? body.code : undefined
  const serverMessage =
    typeof body?.message === 'string' ? body.message : undefined

  if (code && CODE_MESSAGES[code]) return CODE_MESSAGES[code]
  // The API already localises some messages (rate limits, validation); keep those.
  if (serverMessage && /[\u0E00-\u0E7F]/u.test(serverMessage)) {
    return serverMessage
  }
  if (!Number.isFinite(status) || status <= 0) return undefined
  if (status >= 500) return 'ระบบขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้ง'
  return STATUS_MESSAGES.find(([value]) => value === status)?.[1]
}
