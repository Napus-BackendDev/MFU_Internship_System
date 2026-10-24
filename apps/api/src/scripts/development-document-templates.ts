import type {
  CanonicalCanvasElementV2,
  CanonicalDocumentV2
} from '@internship/shared-types'

/** Complete local-development examples; published copies are never rewritten by seed reruns. */
export function createDevelopmentDocumentTemplate(
  type: 'certificate' | 'transcript'
): {
  canonicalJson: CanonicalDocumentV2
  placeholders: string[]
} {
  const certificate = type === 'certificate'
  const width = certificate ? 1024 : 794
  const elements: CanonicalCanvasElementV2[] = []
  const text = (
    id: string,
    content: string,
    y: number,
    size = 16,
    centered = false
  ): void => {
    elements.push({
      id,
      type: 'text',
      content,
      x: 60,
      y,
      width: width - 120,
      fontFamily: 'Sarabun',
      fontSize: size,
      fontWeight: 'normal',
      color: '#0f172a',
      textAlign: centered ? 'center' : 'left'
    })
  }
  text('university-th', 'มหาวิทยาลัยแม่ฟ้าหลวง', 55, 24, true)
  text('university-en', 'MAE FAH LUANG UNIVERSITY', 90, 16, true)
  text(
    'title',
    certificate
      ? 'ใบประกาศนียบัตรรับรองการฝึกงาน'
      : 'ใบบันทึกผลการประเมินการฝึกงาน (INTERNSHIP TRANSCRIPT)',
    140,
    certificate ? 28 : 20,
    true
  )
  text('document-number', 'เลขที่เอกสาร: {{doc_number}}', 200, 13)
  text('issue-date', 'วันที่ออกเอกสาร: {{issue_date}}', 225, 13)
  text('student-id', 'รหัสนักศึกษา: {{student_id}}', 270)
  text('student-th', 'ชื่อ-นามสกุล: {{student_name_th}}', 305, 20)
  text('student-en', 'Full Name: {{student_name_en}}', 345)
  text('school', 'สำนักวิชา: {{school_name}}', 385)
  text('program', 'หลักสูตร: {{program_name}}', 420)
  text('academic-year', 'ปีการศึกษา: {{academic_year}}', 455)
  text('organization', 'สถานประกอบการ: {{organization_name}}', 490)
  text('position', 'ตำแหน่ง: {{position_title}}', 525)
  text('period', 'ระยะเวลาฝึกงาน: {{training_period}}', 560)
  if (certificate) {
    text(
      'completion',
      'รับรองการจบการฝึกงานตามวันที่และผลประเมินที่บันทึกในระบบ',
      625,
      16,
      true
    )
  } else {
    elements.push({
      id: 'competencies',
      type: 'table',
      content: 'COMPETENCY_TABLE',
      x: 60,
      y: 620,
      width: width - 120,
      height: 150,
      fontFamily: 'Sarabun',
      fontSize: 14,
      fontWeight: 'normal',
      color: '#0f172a',
      textAlign: 'left'
    })
    text(
      'evaluation-count',
      'จำนวนผลประเมินที่ใช้: {{evaluation_count}}',
      805,
      14
    )
    text('reference', 'รหัสอ้างอิง: {{doc_number}}', 850, 12)
  }
  const placeholders = [
    ...new Set(
      elements.flatMap((element) =>
        [...element.content.matchAll(/\{\{([a-z_]+)\}\}/g)].map(
          (match) => match[1]!
        )
      )
    )
  ]
  return {
    canonicalJson: {
      width,
      height: certificate ? 724 : 1123,
      elements,
      editorMetadata: {
        nameTh: certificate
          ? 'ใบประกาศนียบัตรรับรองการฝึกงาน'
          : 'ใบบันทึกผลการประเมินการฝึกงาน',
        backgroundType: 'none'
      }
    },
    placeholders
  }
}
