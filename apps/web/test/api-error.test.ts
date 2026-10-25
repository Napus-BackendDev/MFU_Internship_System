import { describe, expect, it } from 'vitest'

import { friendlyApiMessage } from '../app/utils/api-error'

describe('friendlyApiMessage', () => {
  it('maps known API codes to actionable Thai text', () => {
    expect(
      friendlyApiMessage({
        status: 409,
        message: '[POST] "/api/v2/users": 409 Conflict',
        data: {
          error: { code: 'USER_EMAIL_EXISTS', message: 'Conflict Exception' }
        }
      })
    ).toBe('อีเมลนี้มีผู้ใช้งานอยู่แล้ว กรุณาใช้อีเมลอื่น')
  })

  it('keeps a Thai message the API already localised', () => {
    expect(
      friendlyApiMessage({
        statusCode: 429,
        data: { error: { code: 'RATE_LIMITED', message: 'กรุณารออีก 5 นาที' } }
      })
    ).toBe('กรุณารออีก 5 นาที')
  })

  it('falls back to a status based message and never exposes raw HTTP text', () => {
    expect(friendlyApiMessage({ status: 409, data: {} })).toContain('ขัดแย้ง')
    expect(friendlyApiMessage({ status: 503 })).toContain('ระบบขัดข้อง')
    expect(friendlyApiMessage({ status: 404 })).toBe('ไม่พบข้อมูลที่ต้องการ')
  })

  it('leaves non-HTTP failures alone', () => {
    expect(friendlyApiMessage(new Error('network down'))).toBeUndefined()
    expect(friendlyApiMessage(undefined)).toBeUndefined()
  })
})
