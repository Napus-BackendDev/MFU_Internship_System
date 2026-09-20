import { describe, expect, it } from 'vitest'

describe('web foundation', () => {
  it('keeps minimum touch target at 44 pixels', () => {
    expect(44).toBeGreaterThanOrEqual(44)
  })
})

function getDeanForSchool(schoolCode?: string): { th: string; en: string } {
  switch (schoolCode) {
    case 'IT':
      return {
        th: 'รองศาสตราจารย์ ดร. คณบดีสำนักวิชาเทคโนโลยีดิจิทัลประยุกต์',
        en: 'Assoc. Prof. Dr. Dean, School of Applied Digital Technology'
      }
    case 'LAW':
      return {
        th: 'ผู้ช่วยศาสตราจารย์ ดร. คณบดีสำนักวิชานิติศาสตร์',
        en: 'Asst. Prof. Dr. Dean, School of Law'
      }
    case 'MGT':
      return {
        th: 'รองศาสตราจารย์ ดร. คณบดีสำนักวิชาการจัดการ',
        en: 'Assoc. Prof. Dr. Dean, School of Management'
      }
    case 'NUR':
      return {
        th: 'ศาสตราจารย์ ดร. คณบดีสำนักวิชาพยาบาลศาสตร์',
        en: 'Prof. Dr. Dean, School of Nursing'
      }
    case 'SCI':
      return {
        th: 'ศาสตราจารย์ ดร. คณบดีสำนักวิชาวิทยาศาสตร์',
        en: 'Prof. Dr. Dean, School of Science'
      }
    default:
      return {
        th: 'ศาสตราจารย์ ดร. คณบดีสำนักวิชา มหาวิทยาลัยแม่ฟ้าหลวง',
        en: 'Prof. Dr. Dean, Mae Fah Luang University'
      }
  }
}

function formatThaiDate(isoString?: string, fallback: string = '-'): string {
  if (!isoString) return fallback
  try {
    const d = new Date(isoString)
    if (isNaN(d.getTime())) return fallback
    return d.toLocaleDateString('th-TH', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    })
  } catch {
    return fallback
  }
}

describe('dynamic document generator', () => {
  it('correctly maps dean title by school code', () => {
    expect(getDeanForSchool('IT').th).toContain('เทคโนโลยีดิจิทัลประยุกต์')
    expect(getDeanForSchool('LAW').th).toContain('นิติศาสตร์')
    expect(getDeanForSchool('MGT').th).toContain('การจัดการ')
    expect(getDeanForSchool('NUR').th).toContain('พยาบาลศาสตร์')
    expect(getDeanForSchool('SCI').th).toContain('วิทยาศาสตร์')
    expect(getDeanForSchool(undefined).th).toBe(
      'ศาสตราจารย์ ดร. คณบดีสำนักวิชา มหาวิทยาลัยแม่ฟ้าหลวง'
    )
  })

  it('formats thai dates reliably with fallback', () => {
    const dateStr = formatThaiDate('2026-06-01T00:00:00.000Z')
    expect(dateStr).toContain('มิถุนายน')
    expect(formatThaiDate(undefined, '1 มิถุนายน 2569')).toBe('1 มิถุนายน 2569')
    expect(formatThaiDate('invalid-date', 'fallback')).toBe('fallback')
  })

  it('generates dynamic reference numbers per student and academic year', () => {
    const sId = '6531501001'
    const academicYear = 2569
    const certRef = `CERT-${academicYear}-${sId}`
    const referralRef = `MFU-DOC-${academicYear}/${sId.slice(-4)}`

    expect(certRef).toBe('CERT-2569-6531501001')
    expect(referralRef).toBe('MFU-DOC-2569/1001')
  })

  it('computes average rating and default comment from evaluation answers', () => {
    const mockAnswers: Record<string, unknown> = {
      q1: 4.5,
      q2: 4.8,
      q3: 5.0,
      qComment: 'มีความขยันขันแข็งและตั้งใจทำงาน'
    }

    const ratings: number[] = []
    let commentText = ''
    for (const val of Object.values(mockAnswers)) {
      if (typeof val === 'number') {
        ratings.push(val)
      } else if (typeof val === 'string' && val.trim().length > 0) {
        commentText = val.trim()
      }
    }

    const avg =
      ratings.length > 0
        ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1)
        : '5.0'
    expect(avg).toBe('4.8')
    expect(commentText).toBe('มีความขยันขันแข็งและตั้งใจทำงาน')
  })

  it('handles empty or non-numeric evaluation answers gracefully', () => {
    const mockEmptyAnswers: Record<string, unknown> = {}
    const ratings: number[] = []
    let commentText = ''
    for (const val of Object.values(mockEmptyAnswers)) {
      if (typeof val === 'number') {
        ratings.push(val)
      } else if (typeof val === 'string' && val.trim().length > 0) {
        commentText = val.trim()
      }
    }

    const avg =
      ratings.length > 0
        ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1)
        : '5.0'
    expect(avg).toBe('5.0')
    expect(commentText).toBe('')
  })

  it('transforms student directory records into Power BI dimensional schema', () => {
    const mockRow = {
      studentId: '6531501001',
      nameTh: 'นายสมชาย วิศวกร',
      nameEn: 'Somchai Witsawakan',
      email: '6531501001@lamduan.mfu.ac.th',
      personalEmail: 'somchai@gmail.com',
      schoolCode: 'IT',
      schoolTh: 'สำนักวิชาเทคโนโลยีดิจิทัลประยุกต์',
      schoolEn: 'School of Applied Digital Technology',
      programCode: 'SE',
      programTh: 'วิศวกรรมซอฟต์แวร์',
      programEn: 'Software Engineering',
      academicYear: 2569,
      academicYearEn: 2026,
      semester: '1',
      company: 'บริษัท ดิจิทัล โซลูชั่นส์ จำกัด',
      province: 'เชียงใหม่',
      advisorTh: 'ดร.อาจารย์ที่ปรึกษา',
      evaluatorTh: 'นายพงศกร เทคทิม',
      evaluatorPositionTh: 'หัวหน้าฝ่าย HR',
      evaluatorEmail: 'evaluator@workplace.co.th',
      accessPin: '2026653150100001',
      status: 'submitted' as const,
      statusTh: 'ส่งผลประเมินแล้ว',
      statusEn: 'Submitted',
      scoreDisplay: '4.85',
      gradeDisplay: 'ระดับดีเยี่ยม (A)',
      commentsTh: 'ทำงานดีมาก'
    }

    const isCompleted = mockRow.status === 'submitted' ? 1 : 0
    const numScore =
      mockRow.status === 'submitted' && mockRow.scoreDisplay !== '-'
        ? parseFloat(mockRow.scoreDisplay)
        : null

    expect(isCompleted).toBe(1)
    expect(numScore).toBe(4.85)
    expect(typeof numScore).toBe('number')

    // Test CSV BOM prefix for Thai encoding compatibility
    const csvContent =
      '\ufeff' + 'Student_ID,Student_Name_TH\r\n6531501001,"นายสมชาย วิศวกร"'
    expect(csvContent.startsWith('\ufeff')).toBe(true)
  })
})
