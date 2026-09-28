interface InvitationActionFailure {
  readonly title: string
  readonly description: string
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function apiErrorCode(error: unknown): string | undefined {
  const data = record(record(error)?.data)
  const nestedError = record(data?.error)
  const code = nestedError?.code ?? data?.code
  return typeof code === 'string' ? code : undefined
}

export function describeInvitationActionFailure(
  error: unknown
): InvitationActionFailure {
  switch (apiErrorCode(error)) {
    case 'INVITATION_REISSUE_REQUIRED':
      return {
        title: 'มีคำเชิญเดิมอยู่แล้ว',
        description:
          'เลือก “แจ้งเตือนการประเมิน” เพื่อใช้ invitation เดิม หรือเลือก “ออกคำเชิญใหม่” เมื่อจำเป็นต้องเพิกถอน PIN เดิม'
      }
    case 'ACTIVE_INVITATION_REQUIRED':
      return {
        title: 'ไม่พบคำเชิญที่ยังใช้งานได้',
        description:
          'ตรวจสอบสถานะ Delivery และ invitation ก่อนส่งคำสั่งใหม่ ระบบไม่ได้ส่ง reminder ซ้ำ'
      }
    case 'ASSIGNMENT_NOT_EDITABLE':
      return {
        title: 'Assignment ปิดรับคำตอบแล้ว',
        description:
          'ตรวจสอบสถานะรอบฝึกงานและ deadline; ไม่มีการเปลี่ยนสถานะงาน'
      }
    case 'CYCLE_CLOSED':
      return {
        title: 'รอบฝึกงานปิดแล้ว',
        description: 'ไม่สามารถเข้าคิว invitation หรือ reminder สำหรับรอบนี้ได้'
      }
    default:
      return {
        title: 'เข้าคิวคำสั่งไม่สำเร็จ',
        description:
          'ตรวจสอบสถานะ Delivery ก่อนลองใหม่ เพื่อป้องกันการส่งซ้ำโดยไม่ทราบผล'
      }
  }
}
