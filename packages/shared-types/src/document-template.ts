export interface CanonicalTextElementV1 {
  readonly type: 'text'
  readonly x: number
  readonly y: number
  readonly fontSize: number
  readonly text: string
}

export interface CanonicalDocumentV1 {
  readonly width: number
  readonly height: number
  readonly elements: readonly CanonicalTextElementV1[]
}

export type CanonicalCanvasElementTypeV2 =
  | 'text'
  | 'variable'
  | 'heading'
  | 'badge'
  | 'table'
  | 'custom_table'
  | 'signature'
  | 'emblem'
  | 'divider'
  | 'shape'

export interface CanonicalCanvasElementV2 {
  readonly id: string
  readonly type: CanonicalCanvasElementTypeV2
  readonly content: string
  readonly variableKey?: string
  readonly x: number
  readonly y: number
  readonly width?: number
  readonly height?: number
  readonly fontSize: number
  readonly fontFamily?: string
  readonly fontWeight: 'normal' | 'bold' | 'semibold'
  readonly fontStyle?: 'normal' | 'italic'
  readonly textDecoration?: 'none' | 'underline'
  readonly color: string
  readonly textAlign: 'left' | 'center' | 'right'
  readonly letterSpacing?: string
  readonly bgColor?: string
  readonly borderWidth?: number
  readonly borderColor?: string
  readonly borderRadius?: number
  readonly padding?: number
  readonly shapeType?: 'rectangle' | 'circle' | 'line' | 'star'
  readonly tableData?: {
    readonly headers: readonly string[]
    readonly rows: readonly (readonly string[])[]
  }
  readonly assetKey?: string
  readonly assetKeys?: readonly string[]
}

export interface CanonicalDocumentV2 {
  readonly width: number
  readonly height: number
  readonly elements: readonly CanonicalCanvasElementV2[]
  readonly editorMetadata?: Readonly<Record<string, unknown>>
}

const supportedPlaceholders = new Set([
  'student_id',
  'student_name',
  'evaluation_count'
])

export function parseCanonicalDocumentV1(
  input: unknown,
  schemaVersion: number,
  declaredPlaceholders: readonly string[]
): CanonicalDocumentV1 | null {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return null
  }
  const value = input as Record<string, unknown>
  if (
    schemaVersion !== 1 ||
    typeof value.width !== 'number' ||
    !Number.isFinite(value.width) ||
    value.width <= 0 ||
    typeof value.height !== 'number' ||
    !Number.isFinite(value.height) ||
    value.height <= 0 ||
    !Array.isArray(value.elements)
  ) {
    return null
  }

  const declared = new Set(declaredPlaceholders)
  const elements: CanonicalTextElementV1[] = []
  for (const candidate of value.elements as unknown[]) {
    if (
      typeof candidate !== 'object' ||
      candidate === null ||
      Array.isArray(candidate)
    ) {
      return null
    }
    const element = candidate as Record<string, unknown>
    if (
      element.type !== 'text' ||
      typeof element.x !== 'number' ||
      !Number.isFinite(element.x) ||
      element.x < 0 ||
      element.x > value.width ||
      typeof element.y !== 'number' ||
      !Number.isFinite(element.y) ||
      element.y < 0 ||
      element.y > value.height ||
      typeof element.fontSize !== 'number' ||
      !Number.isFinite(element.fontSize) ||
      element.fontSize <= 0 ||
      typeof element.text !== 'string'
    ) {
      return null
    }

    const placeholders = [...element.text.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/gu)]
    if (
      placeholders.some((match) => {
        const key = match[1]
        return !key || !supportedPlaceholders.has(key) || !declared.has(key)
      })
    ) {
      return null
    }

    elements.push({
      type: 'text',
      x: element.x,
      y: element.y,
      fontSize: element.fontSize,
      text: element.text
    })
  }

  return { width: value.width, height: value.height, elements }
}

const supportedCanvasTypesV2 = new Set<CanonicalCanvasElementTypeV2>([
  'text',
  'variable',
  'heading',
  'badge',
  'table',
  'custom_table',
  'signature',
  'emblem',
  'divider',
  'shape'
])

const supportedPlaceholdersV2 = new Set([
  'student_id',
  'student_name_th',
  'student_name_en',
  'school_name',
  'program_name',
  'organization_name',
  'position_title',
  'academic_year',
  'training_period',
  'total_hours',
  'issue_date',
  'doc_number',
  'evaluation_count',
  'hard_skill_average',
  'hard_skill_answered_count',
  'soft_skill_average',
  'soft_skill_answered_count'
])

const canvasColorPattern = /^#[\da-f]{6}$/iu

export function parseCanonicalDocumentV2(
  input: unknown,
  schemaVersion: number,
  declaredPlaceholders: readonly string[]
): CanonicalDocumentV2 | null {
  if (
    typeof input !== 'object' ||
    input === null ||
    Array.isArray(input) ||
    schemaVersion !== 2
  ) {
    return null
  }

  const value = input as Record<string, unknown>
  if (
    !isFiniteInRange(value.width, 1, 5000) ||
    !isFiniteInRange(value.height, 1, 5000) ||
    !Array.isArray(value.elements) ||
    value.elements.length > 250
  ) {
    return null
  }

  const declared = new Set(declaredPlaceholders)
  if (declared.size !== declaredPlaceholders.length) return null
  const elementIds = new Set<string>()
  const elements: CanonicalCanvasElementV2[] = []
  const usedPlaceholders = new Set<string>()

  for (const candidate of value.elements as unknown[]) {
    if (
      typeof candidate !== 'object' ||
      candidate === null ||
      Array.isArray(candidate)
    ) {
      return null
    }
    const element = candidate as Record<string, unknown>
    if (
      typeof element.id !== 'string' ||
      element.id.length < 1 ||
      element.id.length > 128 ||
      elementIds.has(element.id) ||
      typeof element.type !== 'string' ||
      !supportedCanvasTypesV2.has(
        element.type as CanonicalCanvasElementTypeV2
      ) ||
      typeof element.content !== 'string' ||
      element.content.length > 10_000 ||
      !isFiniteInRange(element.x, 0, value.width) ||
      !isFiniteInRange(element.y, 0, value.height) ||
      !isOptionalFiniteInRange(element.width, 0.01, value.width) ||
      !isOptionalFiniteInRange(element.height, 0.01, value.height) ||
      (typeof element.width === 'number' &&
        element.x + element.width > value.width) ||
      (typeof element.height === 'number' &&
        element.y + element.height > value.height) ||
      !isFiniteInRange(element.fontSize, 1, 256) ||
      !isAllowedFontWeight(element.fontWeight) ||
      !isAllowedOptionalFontStyle(element.fontStyle) ||
      !isAllowedOptionalTextDecoration(element.textDecoration) ||
      !isCanvasColor(element.color) ||
      !isAllowedTextAlign(element.textAlign) ||
      !isOptionalString(element.variableKey, 128) ||
      !isOptionalString(element.fontFamily, 120) ||
      !isOptionalString(element.letterSpacing, 32) ||
      !isOptionalCanvasColor(element.bgColor) ||
      !isOptionalFiniteInRange(element.borderWidth, 0, 32) ||
      !isOptionalCanvasColor(element.borderColor) ||
      !isOptionalFiniteInRange(element.borderRadius, 0, 256) ||
      !isOptionalFiniteInRange(element.padding, 0, 256) ||
      !isOptionalShapeType(element.shapeType) ||
      !isOptionalNonEmptyString(element.assetKey, 512) ||
      !isOptionalStringArray(element.assetKeys, 8) ||
      !isAllowedTableData(element.tableData)
    ) {
      return null
    }

    const type = element.type as CanonicalCanvasElementTypeV2
    if (
      (type === 'shape' &&
        (!element.shapeType ||
          !isFiniteInRange(element.width, 0.01, value.width) ||
          !isFiniteInRange(element.height, 0.01, value.height))) ||
      (type !== 'shape' && element.shapeType !== undefined) ||
      (type === 'custom_table' && !isAllowedTableData(element.tableData)) ||
      (type !== 'custom_table' && element.tableData !== undefined)
    ) {
      return null
    }

    if (
      (type === 'variable' &&
        (typeof element.variableKey !== 'string' ||
          !supportedPlaceholdersV2.has(element.variableKey) ||
          !declared.has(element.variableKey) ||
          ![...element.content.matchAll(/\{\{\s*([\w.-]+)\s*\}\}/gu)].some(
            (match) => match[1] === element.variableKey
          ))) ||
      (type !== 'variable' && element.variableKey !== undefined)
    ) {
      return null
    }

    const textValues = [element.content]
    if (element.tableData && isRecord(element.tableData)) {
      const table = element.tableData as {
        headers: string[]
        rows: string[][]
      }
      textValues.push(...table.headers, ...table.rows.flat())
    }
    for (const text of textValues) {
      for (const match of text.matchAll(/\{\{\s*([\w.-]+)\s*\}\}/gu)) {
        const key = match[1]
        if (!key || !supportedPlaceholdersV2.has(key) || !declared.has(key)) {
          return null
        }
        usedPlaceholders.add(key)
      }
    }

    if (
      (type === 'emblem' && element.assetKey !== undefined) ||
      (type === 'signature' && element.assetKeys !== undefined)
    ) {
      // Asset references are structurally validated here; publication also
      // verifies their registered type, active status, rights record and bytes.
    } else if (
      (type === 'emblem' && element.assetKeys !== undefined) ||
      (type === 'signature' && element.assetKey !== undefined) ||
      (type !== 'emblem' &&
        type !== 'signature' &&
        (element.assetKey !== undefined || element.assetKeys !== undefined))
    ) {
      return null
    }
    if (
      type === 'signature' &&
      element.assetKeys !== undefined &&
      (element.assetKeys as readonly string[]).length !== 2
    ) {
      return null
    }

    elementIds.add(element.id)
    elements.push({
      id: element.id,
      type,
      content: element.content,
      ...(typeof element.variableKey === 'string'
        ? { variableKey: element.variableKey }
        : {}),
      x: element.x,
      y: element.y,
      ...(typeof element.width === 'number' ? { width: element.width } : {}),
      ...(typeof element.height === 'number' ? { height: element.height } : {}),
      fontSize: element.fontSize,
      ...(typeof element.fontFamily === 'string'
        ? { fontFamily: element.fontFamily }
        : {}),
      fontWeight: element.fontWeight,
      ...(typeof element.fontStyle === 'string'
        ? { fontStyle: element.fontStyle as 'normal' | 'italic' }
        : {}),
      ...(typeof element.textDecoration === 'string'
        ? {
            textDecoration: element.textDecoration as 'none' | 'underline'
          }
        : {}),
      color: element.color,
      textAlign: element.textAlign,
      ...(typeof element.letterSpacing === 'string'
        ? { letterSpacing: element.letterSpacing }
        : {}),
      ...(typeof element.bgColor === 'string'
        ? { bgColor: element.bgColor }
        : {}),
      ...(typeof element.borderWidth === 'number'
        ? { borderWidth: element.borderWidth }
        : {}),
      ...(typeof element.borderColor === 'string'
        ? { borderColor: element.borderColor }
        : {}),
      ...(typeof element.borderRadius === 'number'
        ? { borderRadius: element.borderRadius }
        : {}),
      ...(typeof element.padding === 'number'
        ? { padding: element.padding }
        : {}),
      ...(typeof element.shapeType === 'string'
        ? {
            shapeType: element.shapeType
          }
        : {}),
      ...(element.tableData && isRecord(element.tableData)
        ? {
            tableData: element.tableData as {
              headers: readonly string[]
              rows: readonly (readonly string[])[]
            }
          }
        : {}),
      ...(typeof element.assetKey === 'string'
        ? { assetKey: element.assetKey }
        : {}),
      ...(Array.isArray(element.assetKeys)
        ? { assetKeys: element.assetKeys }
        : {})
    })
  }

  if (
    usedPlaceholders.size !== declared.size ||
    [...declared].some((placeholder) => !usedPlaceholders.has(placeholder))
  ) {
    return null
  }

  return {
    width: value.width,
    height: value.height,
    elements,
    ...(isRecord(value.editorMetadata)
      ? { editorMetadata: value.editorMetadata }
      : {})
  }
}

function isFiniteInRange(
  value: unknown,
  minimum: number,
  maximum: number
): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= minimum &&
    value <= maximum
  )
}

function isOptionalFiniteInRange(
  value: unknown,
  minimum: number,
  maximum: number
): boolean {
  return value === undefined || isFiniteInRange(value, minimum, maximum)
}

function isAllowedFontWeight(
  value: unknown
): value is CanonicalCanvasElementV2['fontWeight'] {
  return value === 'normal' || value === 'bold' || value === 'semibold'
}

function isAllowedOptionalFontStyle(value: unknown): boolean {
  return value === undefined || value === 'normal' || value === 'italic'
}

function isAllowedOptionalTextDecoration(value: unknown): boolean {
  return value === undefined || value === 'none' || value === 'underline'
}

function isAllowedTextAlign(
  value: unknown
): value is CanonicalCanvasElementV2['textAlign'] {
  return value === 'left' || value === 'center' || value === 'right'
}

function isOptionalString(value: unknown, maximumLength: number): boolean {
  return (
    value === undefined ||
    (typeof value === 'string' && value.length <= maximumLength)
  )
}

function isOptionalNonEmptyString(
  value: unknown,
  maximumLength: number
): boolean {
  return (
    value === undefined ||
    (typeof value === 'string' &&
      value.length > 0 &&
      value.length <= maximumLength)
  )
}

function isCanvasColor(value: unknown): value is string {
  return typeof value === 'string' && canvasColorPattern.test(value)
}

function isOptionalCanvasColor(value: unknown): boolean {
  return value === undefined || isCanvasColor(value)
}

function isOptionalShapeType(
  value: unknown
): value is CanonicalCanvasElementV2['shapeType'] | undefined {
  return (
    value === undefined ||
    value === 'rectangle' ||
    value === 'circle' ||
    value === 'line' ||
    value === 'star'
  )
}

function isOptionalStringArray(
  value: unknown,
  maximumLength: number
): value is string[] | undefined {
  return (
    value === undefined ||
    (Array.isArray(value) &&
      value.length <= maximumLength &&
      value.every((item) => typeof item === 'string' && item.length <= 512) &&
      new Set(value).size === value.length)
  )
}

function isAllowedTableData(value: unknown): boolean {
  if (value === undefined) return true
  if (
    !isRecord(value) ||
    !Array.isArray(value.headers) ||
    !Array.isArray(value.rows)
  ) {
    return false
  }
  const headers: unknown[] = value.headers
  const rows: unknown[] = value.rows
  if (
    headers.length < 1 ||
    headers.length > 12 ||
    !headers.every(
      (header) => typeof header === 'string' && header.length <= 1000
    ) ||
    rows.length > 100
  ) {
    return false
  }
  return rows.every(
    (row) =>
      Array.isArray(row) &&
      row.length === headers.length &&
      row.every((cell) => typeof cell === 'string' && cell.length <= 1000)
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
