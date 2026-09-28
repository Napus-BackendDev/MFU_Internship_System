import { describe, expect, it } from 'vitest'

import {
  buildStudentDirectoryExportRows,
  type StudentDirectoryExportSource
} from '../app/utils/student-directory-export.js'

describe('student directory exports', () => {
  it('never exports legacy PINs or invitation credentials in either locale', () => {
    const row = {
      studentId: '6531501001',
      nameTh: 'นักศึกษาทดสอบ',
      nameEn: 'Test Student',
      email: 'student@example.test',
      personalEmail: '-',
      schoolTh: 'สำนักวิชาทดสอบ',
      schoolEn: 'Test School',
      programTh: 'หลักสูตรทดสอบ',
      programEn: 'Test Program',
      courseDisplay: '-',
      academicYear: 2569,
      academicYearEn: 2026,
      semester: '1',
      company: 'Test Company',
      companyAddress: '-',
      province: '-',
      advisorTh: '-',
      advisorEn: '-',
      evaluatorTh: 'Evaluator',
      evaluatorEn: 'Evaluator',
      evaluatorPositionTh: 'Supervisor',
      evaluatorPositionEn: 'Supervisor',
      evaluatorEmail: 'evaluator@example.test',
      statusTh: 'รอประเมิน',
      statusEn: 'Pending',
      scoreDisplay: '-',
      gradeDisplay: '-',
      gradeDisplayEn: '-',
      accessPin: 'LEGACY-PIN-MUST-NOT-LEAK',
      invitationToken: 'INVITATION-TOKEN-MUST-NOT-LEAK',
      invitationUrl: 'https://example.test/evaluate#secret'
    }
    const source: StudentDirectoryExportSource = row

    for (const locale of ['th', 'en'] as const) {
      const [exported] = buildStudentDirectoryExportRows([source], locale)
      expect(exported).toBeDefined()
      expect(Object.keys(exported ?? {})).not.toContain('Access PIN Code')
      expect(Object.keys(exported ?? {})).not.toContain('รหัส PIN เข้าทำฟอร์ม')
      expect(JSON.stringify(exported)).not.toContain('LEGACY-PIN-MUST-NOT-LEAK')
      expect(JSON.stringify(exported)).not.toContain(
        'INVITATION-TOKEN-MUST-NOT-LEAK'
      )
      expect(JSON.stringify(exported)).not.toContain('#secret')
    }
  })
})
