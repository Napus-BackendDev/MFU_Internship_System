import {
  parseCanonicalDocumentV1,
  parseCanonicalDocumentV2,
  type CanonicalCanvasElementV2,
  type CanonicalDocumentV2
} from '@internship/shared-types'

export interface EditorCanonicalDocument extends Omit<
  CanonicalDocumentV2,
  'elements'
> {
  readonly elements: readonly CanonicalCanvasElementV2[]
}

export interface AdaptedEditorDocument {
  readonly document: EditorCanonicalDocument
  readonly migratedFromV1: boolean
}

const legacyStudentNamePlaceholder = /\{\{\s*student_name\s*\}\}/gu

function safeEditorMetadata(
  value: unknown
): Readonly<Record<string, unknown>> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined
  }

  const input = value as Record<string, unknown>
  const metadata: Record<string, unknown> = {}
  for (const key of ['nameTh', 'nameEn', 'description'] as const) {
    if (typeof input[key] === 'string') metadata[key] = input[key]
  }
  if (
    input.backgroundType === 'watermark' ||
    input.backgroundType === 'certificate_pattern' ||
    input.backgroundType === 'geometric' ||
    input.backgroundType === 'custom' ||
    input.backgroundType === 'none'
  ) {
    metadata.backgroundType = input.backgroundType
  }
  if (
    typeof input.bgOpacity === 'number' &&
    Number.isFinite(input.bgOpacity) &&
    input.bgOpacity >= 0 &&
    input.bgOpacity <= 100
  ) {
    metadata.bgOpacity = input.bgOpacity
  }

  return Object.keys(metadata).length > 0 ? metadata : undefined
}

export function adaptCanonicalDocumentForEditor(
  canonicalJson: unknown,
  schemaVersion: number,
  placeholders: readonly string[]
): AdaptedEditorDocument | null {
  if (schemaVersion === 1) {
    const legacy = parseCanonicalDocumentV1(
      canonicalJson,
      schemaVersion,
      placeholders
    )
    if (
      !legacy ||
      legacy.width > 5000 ||
      legacy.height > 5000 ||
      legacy.elements.length > 250
    ) {
      return null
    }

    const elements: CanonicalCanvasElementV2[] = []
    for (const [index, element] of legacy.elements.entries()) {
      if (
        element.fontSize < 1 ||
        element.fontSize > 256 ||
        element.text.length > 10_000
      ) {
        return null
      }
      elements.push({
        id: `legacy-v1-text-${index + 1}`,
        type: 'text',
        content: element.text.replace(
          legacyStudentNamePlaceholder,
          '{{student_name_th}}'
        ),
        x: element.x,
        y: element.y,
        fontSize: element.fontSize,
        fontWeight: 'normal',
        color: '#1f2633',
        textAlign: 'left'
      })
    }

    const input = canonicalJson as Record<string, unknown>
    const editorMetadata = safeEditorMetadata(input.editorMetadata)
    return {
      document: {
        width: legacy.width,
        height: legacy.height,
        elements,
        ...(editorMetadata ? { editorMetadata } : {})
      },
      migratedFromV1: true
    }
  }

  if (schemaVersion !== 2) return null
  const current = parseCanonicalDocumentV2(
    canonicalJson,
    schemaVersion,
    placeholders
  )
  return current ? { document: current, migratedFromV1: false } : null
}
