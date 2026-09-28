import { describe, expect, it } from 'vitest'

import { describeInvitationActionFailure } from '../app/utils/invitation-action-error'

describe('invitation action failure feedback', () => {
  it('directs existing invitations to the reminder or explicit reissue action', () => {
    expect(
      describeInvitationActionFailure({
        data: { error: { code: 'INVITATION_REISSUE_REQUIRED' } }
      })
    ).toEqual({
      title: 'มีคำเชิญเดิมอยู่แล้ว',
      description:
        'เลือก “แจ้งเตือนการประเมิน” เพื่อใช้ invitation เดิม หรือเลือก “ออกคำเชิญใหม่” เมื่อจำเป็นต้องเพิกถอน PIN เดิม'
    })
  })

  it('does not report workflow conflicts as SMTP/email delivery failures', () => {
    const result = describeInvitationActionFailure(new Error('network error'))

    expect(result.title).toBe('เข้าคิวคำสั่งไม่สำเร็จ')
    expect(result.description).toContain('ตรวจสอบสถานะ Delivery')
    expect(`${result.title} ${result.description}`).not.toContain(
      'อีเมลผิดพลาด'
    )
  })
})
