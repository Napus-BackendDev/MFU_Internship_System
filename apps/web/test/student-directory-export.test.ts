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
      schoolTh: 'สำนักวิชาทดสอบ',
      schoolEn: 'Test School',
      programTh: 'หลักสูตรทดสอบ',
      programEn: 'Test Program',
      courseDisplay: '-',
      academicYear: 2569,
      academicYearEn: 2026,
      semester: 'ภาคการศึกษาต้น',
      semesterEn: 'Semester 1',
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
      hardSkillScore: {
        average: 4.25,
        answeredCount: 2,
        scaleMin: 1,
        scaleMax: 5
      },
      softSkillScore: {
        average: 3.5,
        answeredCount: 1,
        scaleMin: 1,
        scaleMax: 5
      },
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
      if (locale === 'th') {
        expect(exported?.['ภาคการศึกษา']).toBe('ภาคการศึกษาต้น')
      } else {
        expect(exported?.Semester).toBe('Semester 1')
      }
    }
  })

  it('exports Hard and Soft Skill means separately with scale and answer count', () => {
    const row: StudentDirectoryExportSource = {
      studentId: '6531501001',
      nameTh: 'นักศึกษาทดสอบ',
      nameEn: 'Test Student',
      email: 'student@example.test',
      schoolTh: 'สำนักวิชาทดสอบ',
      schoolEn: 'Test School',
      programTh: 'หลักสูตรทดสอบ',
      programEn: 'Test Program',
      courseDisplay: '-',
      academicYear: 2569,
      academicYearEn: 2026,
      semester: 'ภาคการศึกษาต้น',
      semesterEn: 'Semester 1',
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
      statusTh: 'ประเมินแล้ว',
      statusEn: 'Submitted',
      hardSkillScore: {
        average: 4.25,
        answeredCount: 2,
        scaleMin: 1,
        scaleMax: 5
      },
      softSkillScore: {
        average: 3.5,
        answeredCount: 1,
        scaleMin: 1,
        scaleMax: 5
      }
    }

    const [thaiRow] = buildStudentDirectoryExportRows([row], 'th')
    const [englishRow] = buildStudentDirectoryExportRows([row], 'en')

    expect(thaiRow).toMatchObject({
      'คะแนน Hard Skill (เฉลี่ย)': '4.3 / 1–5 (2 ข้อ)',
      'คะแนน Soft Skill (เฉลี่ย)': '3.5 / 1–5 (1 ข้อ)'
    })
    expect(englishRow).toMatchObject({
      Semester: 'Semester 1',
      'Hard Skill Average': '4.3 / 1–5 (2 items)',
      'Soft Skill Average': '3.5 / 1–5 (1 items)'
    })
    expect(Object.keys(thaiRow ?? {})).toHaveLength(20)
    expect(Object.keys(englishRow ?? {})).toHaveLength(20)
    expect(Object.keys(thaiRow ?? {})).not.toContain('คะแนนเฉลี่ยรวม')
    expect(Object.keys(englishRow ?? {})).not.toContain('Average Score')
    expect(Object.keys(englishRow ?? {})).not.toContain('Grade')
  })

  it('uses a dash when category score has no average', () => {
    const [row] = buildStudentDirectoryExportRows(
      [
        {
          studentId: '6531501001',
          nameTh: 'นักศึกษาทดสอบ',
          nameEn: 'Test Student',
          email: 'student@example.test',
          schoolTh: 'สำนักวิชาทดสอบ',
          schoolEn: 'Test School',
          programTh: 'หลักสูตรทดสอบ',
          programEn: 'Test Program',
          courseDisplay: '-',
          academicYear: 2569,
          academicYearEn: 2026,
          semester: '1',
          semesterEn: 'Semester 1',
          company: 'Test Company',
          companyAddress: '-',
          province: '-',
          advisorTh: '-',
          advisorEn: '-',
          evaluatorTh: '-',
          evaluatorEn: '-',
          evaluatorPositionTh: '-',
          evaluatorPositionEn: '-',
          evaluatorEmail: '-',
          statusTh: 'รอประเมิน',
          statusEn: 'Pending',
          hardSkillScore: {
            average: null,
            answeredCount: 0,
            scaleMin: null,
            scaleMax: null
          }
        }
      ],
      'en'
    )

    expect(row?.['Hard Skill Average']).toBe('-')
    expect(row?.['Soft Skill Average']).toBe('-')
  })
})
