// Turns an API failure into a message a person can act on, instead of the raw
// `[POST] "/api/v2/users": 409 Conflict` text that $fetch puts in Error.message.
const CODE_MESSAGES: Readonly<Record<string, string>> = {
  USER_EMAIL_EXISTS: 'อีเมลนี้มีผู้ใช้งานอยู่แล้ว กรุณาใช้อีเมลอื่น',
  PERMISSION_DENIED: 'คุณไม่มีสิทธิ์ดำเนินการนี้',
  RESOURCE_NOT_FOUND: 'ไม่พบข้อมูลที่ต้องการ อาจถูกลบหรือย้ายไปแล้ว',
  VERSION_CONFLICT:
    'ข้อมูลถูกแก้ไขโดยผู้อื่นก่อนหน้านี้ กรุณารีเฟรชแล้วลองใหม่',
  IDEMPOTENCY_KEY_REUSED: 'คำขอนี้ถูกใช้ไปแล้วด้วยข้อมูลอื่น กรุณาลองใหม่'
}

const STATUS_MESSAGES: ReadonlyArray<readonly [number, string]> = [
  [400, 'ข้อมูลที่ส่งไม่ถูกต้อง กรุณาตรวจสอบแล้วลองใหม่'],
  [401, 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่'],
  [403, 'คุณไม่มีสิทธิ์ดำเนินการนี้'],
  [404, 'ไม่พบข้อมูลที่ต้องการ'],
  [409, 'ข้อมูลขัดแย้งกับรายการที่มีอยู่แล้ว กรุณาตรวจสอบแล้วลองใหม่'],
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
