export type StudentDocumentType = 'certificate' | 'transcript'

export type GeneratedDocumentStatus =
  'queued' | 'processing' | 'ready' | 'failed'

export interface StudentGeneratedDocument {
  readonly id: string
  readonly documentType: StudentDocumentType | null
  readonly documentNumber?: string | null
  readonly evaluationIds?: readonly string[]
  readonly status: GeneratedDocumentStatus
  readonly createdAt: string
}

export interface StudentDocumentTemplateCandidate {
  readonly templateId: string
  readonly documentType: StudentDocumentType
  readonly templateStatus: 'active' | 'archived'
  readonly publishedVersionId: string | null
}

export type PublishedDocumentVersionResolution =
  | { readonly status: 'available'; readonly versionId: string }
  | { readonly status: 'unavailable' | 'ambiguous' }

export function resolvePublishedDocumentVersion(
  candidates: readonly StudentDocumentTemplateCandidate[],
  documentType: StudentDocumentType
): PublishedDocumentVersionResolution {
  const eligible = candidates.filter(
    (candidate) =>
      candidate.documentType === documentType &&
      candidate.templateStatus === 'active' &&
      candidate.publishedVersionId
  )
  if (eligible.length !== 1) {
    return { status: eligible.length === 0 ? 'unavailable' : 'ambiguous' }
  }
  const versionId = eligible[0]?.publishedVersionId
  return versionId
    ? { status: 'available', versionId }
    : { status: 'unavailable' }
}

export function findDocumentForEvaluationSet<
  T extends StudentGeneratedDocument
>(
  documents: readonly T[],
  documentType: StudentDocumentType,
  evaluationIds: readonly string[]
): T | null {
  const expected = [...new Set(evaluationIds)].sort()
  if (expected.length === 0) return null
  return (
    documents.find((document) => {
      if (document.documentType !== documentType || !document.evaluationIds) {
        return false
      }
      const actual = [...new Set(document.evaluationIds)].sort()
      return (
        actual.length === expected.length &&
        actual.every((id, index) => id === expected[index])
      )
    }) ?? null
  )
}

export async function createStudentDocumentIdempotencyKey(input: {
  readonly studentId: string
  readonly documentType: StudentDocumentType
  readonly templateVersionId: string
  readonly evaluationIds: readonly string[]
}): Promise<string> {
  const evaluationIds = [...new Set(input.evaluationIds)].sort()
  if (
    !input.studentId ||
    !input.templateVersionId ||
    evaluationIds.length === 0
  ) {
    throw new Error('DOCUMENT_IDEMPOTENCY_INPUT_INVALID')
  }
  const payload = JSON.stringify({
    studentId: input.studentId,
    documentType: input.documentType,
    templateVersionId: input.templateVersionId,
    evaluationIds
  })
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(payload)
  )
  const hex = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('')
  return `student-document-${hex}`
}

export interface StudentDocumentState {
  readonly latest: StudentGeneratedDocument | null
  readonly downloadable: StudentGeneratedDocument | null
  readonly label: string
}

export function getStudentDocumentState(
  documents: readonly StudentGeneratedDocument[],
  documentType: StudentDocumentType
): StudentDocumentState {
  const matching = documents
    .filter((document) => document.documentType === documentType)
    .toSorted((left, right) => {
      const leftTime = Date.parse(left.createdAt)
      const rightTime = Date.parse(right.createdAt)
      return (
        (Number.isFinite(rightTime) ? rightTime : 0) -
        (Number.isFinite(leftTime) ? leftTime : 0)
      )
    })
  const latest = matching[0] ?? null
  const downloadable =
    matching.find((document) => document.status === 'ready') ?? null
  const label = latest
    ? {
        queued: 'รอจัดทำ PDF',
        processing: 'กำลังจัดทำ PDF',
        ready: 'พร้อมดาวน์โหลด',
        failed: 'จัดทำ PDF ไม่สำเร็จ'
      }[latest.status]
    : 'ยังไม่มีเอกสารที่ออกแล้ว'

  return { latest, downloadable, label }
}
