import { describe, expect, it } from 'vitest'

import {
  toStudentDirectoryExportValues,
  type StudentDirectoryExportSource
} from '../src/reports/student-directory-export.js'

const student: StudentDirectoryExportSource = {
  schoolId: 'school-1',
  programId: 'program-1',
  studentId: '6531501001',
  name: { th: 'นักศึกษาทดสอบ', en: 'Test Student' },
  email: 'student@example.test',
  academicTermId: 'term-1',
  academicYear: 2026,
  semester: '1',
  advisor: { th: 'อาจารย์ที่ปรึกษา', en: 'Academic Advisor' },
  course: 'Internship',
  directoryRelations: {
    school: { name: { th: 'สำนักวิชา', en: 'School' } },
    program: { name: { th: 'หลักสูตร', en: 'Program' } },
    term: { id: 'term-1', academicYear: 2026, semester: '1' },
    assignments: [
      {
        cycleId: 'cycle-1',
        placementId: 'placement-1',
        status: 'submitted',
        categoryScores: {
          hardSkill: {
            average: 4.25,
            answeredCount: 2,
            scaleMin: 1,
            scaleMax: 5
          },
          softSkill: {
            average: 3.5,
            answeredCount: 1,
            scaleMin: 1,
            scaleMax: 5
          }
        },
        evaluator: {
          name: { th: 'ผู้ประเมิน', en: 'Evaluator' },
          email: 'evaluator@example.test',
          position: { th: 'หัวหน้างาน', en: 'Supervisor' }
        }
      }
    ],
    placements: [
      {
        id: 'placement-1',
        academicTermId: 'term-1',
        academicTerm: { id: 'term-1', academicYear: 2026, semester: '1' },
        organization: {
          name: { th: 'บริษัททดสอบ', en: 'Test Company' },
          address: { street: '1 Test Road', province: 'Chiang Rai' }
        }
      }
    ]
  }
}

describe('student-directory server export mapping', () => {
  it('uses the selected cycle placement and preserves category-specific score meaning', () => {
    expect(
      toStudentDirectoryExportValues(student, 'cycle-1', 'en')
    ).toMatchObject({
      studentId: '6531501001',
      company: 'บริษัททดสอบ',
      companyAddress: '1 Test Road',
      province: 'Chiang Rai',
      academicYear: 2569,
      academicYearEn: 2026,
      semesterEn: 'Semester 1',
      statusEn: 'Submitted',
      hardSkillScore: '4.3 / 1–5 (2 items)',
      softSkillScore: '3.5 / 1–5 (1 items)'
    })
  })

  it('does not invent evaluation status or scores when a cycle is unselected', () => {
    expect(
      toStudentDirectoryExportValues(student, undefined, 'th')
    ).toMatchObject({
      statusTh: 'เลือกรอบฝึกงานเพื่อดูสถานะ',
      hardSkillScore: '-',
      softSkillScore: '-',
      company: 'บริษัททดสอบ'
    })
  })

  it('uses the placement from the selected cycle term when no assignment exists', () => {
    const withMultiplePlacements: StudentDirectoryExportSource = {
      ...student,
      directoryRelations: {
        ...student.directoryRelations,
        assignments: [],
        placements: [
          {
            id: 'placement-previous-term',
            academicTermId: 'term-previous',
            academicTerm: {
              id: 'term-previous',
              academicYear: 2025,
              semester: '2'
            },
            organization: {
              name: { th: 'บริษัทเดิม', en: 'Previous Company' }
            }
          },
          ...student.directoryRelations!.placements!
        ]
      }
    }

    expect(
      toStudentDirectoryExportValues(withMultiplePlacements, 'cycle-1', 'en')
    ).toMatchObject({
      company: 'บริษัททดสอบ',
      academicYearEn: 2026,
      semesterEn: 'Semester 1',
      statusEn: 'Awaiting Evaluator'
    })
  })

  it('marks duplicate assignments ambiguous and excludes an arbitrary score', () => {
    const ambiguous: StudentDirectoryExportSource = {
      ...student,
      directoryRelations: {
        ...student.directoryRelations,
        assignments: [
          ...student.directoryRelations!.assignments!,
          { ...student.directoryRelations!.assignments![0]! }
        ]
      }
    }

    expect(
      toStudentDirectoryExportValues(ambiguous, 'cycle-1', 'en')
    ).toMatchObject({
      statusEn: 'Duplicate assignments in this cycle',
      evaluatorEmail: '-',
      hardSkillScore: '-',
      softSkillScore: '-'
    })
  })
})
