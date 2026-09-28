export interface DocumentIssueLocalizedText {
  readonly th: string
  readonly en: string
}

export interface DocumentIssueCategoryScore {
  readonly average: number | null
  readonly answeredCount: number
  readonly scaleMin: number | null
  readonly scaleMax: number | null
}

export interface DocumentIssueEvaluationSnapshot {
  readonly id: string
  readonly assignmentId: string
  readonly version: number
  readonly submittedAt: string
  readonly answers: Readonly<Record<string, unknown>>
  readonly questionSnapshot: readonly unknown[]
  readonly categoryScores: {
    readonly hardSkill: DocumentIssueCategoryScore
    readonly softSkill: DocumentIssueCategoryScore
    readonly scoringPolicyVersion: string
  } | null
}

export interface DocumentIssueSnapshotV1 {
  readonly snapshotVersion: 1
  readonly capturedAt: string
  readonly documentNumber: string
  readonly template: {
    readonly versionId: string
    readonly documentType: 'transcript' | 'certificate'
    readonly schemaVersion: number
    readonly canonicalJson: Readonly<Record<string, unknown>>
    readonly placeholders: readonly string[]
    readonly fontAssets: readonly {
      readonly key: string
      readonly sha256: string
      readonly fontFamily?: string
    }[]
    readonly imageAssets?: readonly {
      readonly key: string
      readonly assetType: 'emblem' | 'signature'
      readonly sha256: string
    }[]
  }
  readonly student: {
    readonly recordId: string
    readonly studentId: string
    readonly name: DocumentIssueLocalizedText
    readonly academicYear: number
    readonly schoolId: string
    readonly schoolName: DocumentIssueLocalizedText
    readonly programId: string
    readonly programName: DocumentIssueLocalizedText
  }
  readonly placement: {
    readonly id: string
    readonly organizationId: string
    readonly organizationName: DocumentIssueLocalizedText
    readonly positionTitle: DocumentIssueLocalizedText
    readonly schoolId: string
    readonly programId: string
    readonly startsAt: string
    readonly endsAt: string
    readonly academicTermId: string
    readonly academicTermCode: string
    readonly academicYear: number
    readonly semester: string
  }
  readonly evaluations: readonly DocumentIssueEvaluationSnapshot[]
}
