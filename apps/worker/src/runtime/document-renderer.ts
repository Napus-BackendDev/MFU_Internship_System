import { degrees, rgb } from 'pdf-lib'
import type { PDFFont, PDFDocument, PDFPage } from 'pdf-lib'
import type {
  CanonicalCanvasElementV2,
  CanonicalDocumentV1,
  CanonicalDocumentV2,
  DocumentIssueSnapshotV1
} from '@internship/shared-types'

type CanonicalDocument = CanonicalDocumentV1 | CanonicalDocumentV2
type CanonicalElement = CanonicalCanvasElementV2

const blockedPlaceholders = new Set(['total_hours'])

export function buildDocumentValues(
  snapshot: DocumentIssueSnapshotV1
): Readonly<Record<string, string>> {
  const score = (
    category: 'hardSkill' | 'softSkill'
  ): { average: string; answeredCount: string } => {
    const entries = snapshot.evaluations.flatMap((evaluation) => {
      const value = evaluation.categoryScores?.[category]
      return value ? [value] : []
    })
    const answeredCount = entries.reduce(
      (total, entry) => total + entry.answeredCount,
      0
    )
    const weightedTotal = entries.reduce(
      (total, entry) => total + (entry.average ?? 0) * entry.answeredCount,
      0
    )
    const average =
      answeredCount > 0 ? (weightedTotal / answeredCount).toFixed(1) : '—'
    return { average, answeredCount: String(answeredCount) }
  }
  const hardSkill = score('hardSkill')
  const softSkill = score('softSkill')
  return {
    student_id: snapshot.student.studentId,
    student_name: snapshot.student.name.th || snapshot.student.name.en,
    student_name_th: snapshot.student.name.th,
    student_name_en: snapshot.student.name.en,
    school_name:
      snapshot.student.schoolName.th || snapshot.student.schoolName.en,
    program_name:
      snapshot.student.programName.th || snapshot.student.programName.en,
    organization_name:
      snapshot.placement.organizationName.th ||
      snapshot.placement.organizationName.en,
    position_title:
      snapshot.placement.positionTitle.th ||
      snapshot.placement.positionTitle.en,
    academic_year: String(snapshot.placement.academicYear),
    training_period: `${formatThaiDate(snapshot.placement.startsAt)} – ${formatThaiDate(snapshot.placement.endsAt)}`,
    issue_date: formatThaiDate(snapshot.capturedAt),
    doc_number: snapshot.documentNumber,
    evaluation_count: String(snapshot.evaluations.length),
    hard_skill_average: hardSkill.average,
    hard_skill_answered_count: hardSkill.answeredCount,
    soft_skill_average: softSkill.average,
    soft_skill_answered_count: softSkill.answeredCount
  }
}

export async function renderDocumentTemplate(
  pdf: PDFDocument,
  page: PDFPage,
  canonical: CanonicalDocument,
  schemaVersion: number,
  snapshot: DocumentIssueSnapshotV1,
  font: PDFFont,
  imageBytes: ReadonlyMap<string, Uint8Array>
): Promise<void> {
  const values = buildDocumentValues(snapshot)
  if (schemaVersion === 1) {
    const document = canonical as CanonicalDocumentV1
    for (const element of document.elements) {
      const text = renderPlaceholders(element.text, values)
      page.drawText(text, {
        x: element.x,
        y: document.height - element.y - element.fontSize,
        size: element.fontSize,
        font,
        color: rgb(0.12, 0.15, 0.2)
      })
    }
    return
  }

  const document = canonical as CanonicalDocumentV2
  for (const element of document.elements) {
    await renderCanvasElement(
      pdf,
      page,
      document,
      element,
      snapshot,
      font,
      imageBytes,
      values
    )
  }
}

function renderPlaceholders(
  input: string,
  values: Readonly<Record<string, string>>
): string {
  return input.replace(/\{\{\s*([\w.-]+)\s*\}\}/gu, (_match, key: string) => {
    if (blockedPlaceholders.has(key)) {
      throw new Error('DOCUMENT_PLACEHOLDER_SOURCE_UNAVAILABLE')
    }
    const value = values[key]
    if (value === undefined) throw new Error('UNKNOWN_DOCUMENT_PLACEHOLDER')
    if (value.trim().length === 0) {
      throw new Error('DOCUMENT_PLACEHOLDER_SOURCE_UNAVAILABLE')
    }
    return value
  })
}

async function renderCanvasElement(
  pdf: PDFDocument,
  page: PDFPage,
  document: CanonicalDocumentV2,
  element: CanonicalElement,
  snapshot: DocumentIssueSnapshotV1,
  font: PDFFont,
  imageBytes: ReadonlyMap<string, Uint8Array>,
  values: Readonly<Record<string, string>>
): Promise<void> {
  const text = renderPlaceholders(element.content, values)
  const width = element.width ?? Math.max(1, document.width - element.x)
  const height = element.height ?? Math.max(1, document.height - element.y)
  const padding = element.padding ?? 0
  const borderColor = element.borderColor
    ? color(element.borderColor)
    : undefined
  const fillColor = element.bgColor ? color(element.bgColor) : undefined

  if (element.type === 'emblem') {
    if (!element.assetKey) throw new Error('DOCUMENT_IMAGE_ASSET_REQUIRED')
    await drawPng(pdf, page, imageBytes, element.assetKey, {
      x: element.x,
      y: element.y,
      width,
      height,
      pageHeight: document.height
    })
    return
  }
  if (element.type === 'signature') {
    if (!element.assetKeys || element.assetKeys.length !== 2) {
      throw new Error('DOCUMENT_IMAGE_ASSET_REQUIRED')
    }
    const sectionWidth = width / 2
    for (const [index, key] of element.assetKeys.entries()) {
      await drawPng(pdf, page, imageBytes, key, {
        x: element.x + index * sectionWidth,
        y: element.y,
        width: sectionWidth,
        height,
        pageHeight: document.height
      })
    }
    return
  }
  if (element.type === 'shape') {
    drawShape(page, element, document.height, fillColor, borderColor)
    if (text) {
      drawTextBox(page, element, document.height, text, font, {
        width,
        height,
        padding,
        color: color(element.color)
      })
    }
    return
  }
  if (element.type === 'divider') {
    page.drawLine({
      start: { x: element.x, y: document.height - element.y },
      end: {
        x: element.x + width,
        y: document.height - element.y - Math.max(0, element.height ?? 0)
      },
      thickness: Math.max(0.5, element.borderWidth ?? 1),
      color: borderColor ?? color(element.color)
    })
    return
  }
  if (element.type === 'table') {
    const hard = aggregateCategory(snapshot, 'hardSkill')
    const soft = aggregateCategory(snapshot, 'softSkill')
    drawTable(
      page,
      document.height,
      element,
      [
        ['หมวดทักษะ', 'คะแนนเฉลี่ย', 'จำนวนข้อที่ตอบ'],
        ['Hard Skill', hard.average, hard.answeredCount],
        ['Soft Skill', soft.average, soft.answeredCount]
      ],
      font,
      color(element.color)
    )
    return
  }
  if (element.type === 'custom_table') {
    if (!element.tableData) throw new Error('DOCUMENT_TABLE_DATA_REQUIRED')
    const headers = element.tableData.headers.map((header) =>
      renderPlaceholders(header, values)
    )
    const rows = element.tableData.rows.map((row) =>
      row.map((cell) => renderPlaceholders(cell, values))
    )
    drawTable(
      page,
      document.height,
      element,
      [headers, ...rows],
      font,
      color(element.color)
    )
    return
  }

  if (fillColor || borderColor) {
    drawBox(
      page,
      element,
      document.height,
      width,
      height,
      fillColor,
      borderColor
    )
  }
  drawTextBox(page, element, document.height, text, font, {
    width,
    height,
    padding,
    color: color(element.color)
  })
}

function drawTextBox(
  page: PDFPage,
  element: Pick<
    CanonicalCanvasElementV2,
    | 'x'
    | 'y'
    | 'fontSize'
    | 'fontWeight'
    | 'fontStyle'
    | 'textDecoration'
    | 'textAlign'
  >,
  pageHeight: number,
  text: string,
  font: PDFFont,
  box: {
    readonly width: number
    readonly height: number
    readonly padding: number
    readonly color: ReturnType<typeof rgb>
  }
): void {
  const maxWidth = Math.max(1, box.width - box.padding * 2)
  const lineHeight = element.fontSize * 1.25
  const lines = wrapText(text, font, element.fontSize, maxWidth)
  if (lines.length * lineHeight > box.height) {
    throw new Error('DOCUMENT_TEXT_OVERFLOW')
  }
  lines.forEach((line, index) => {
    const measuredWidth = font.widthOfTextAtSize(line, element.fontSize)
    const textX =
      element.x +
      box.padding +
      (element.textAlign === 'center'
        ? Math.max(0, (maxWidth - measuredWidth) / 2)
        : element.textAlign === 'right'
          ? Math.max(0, maxWidth - measuredWidth)
          : 0)
    const y = pageHeight - element.y - element.fontSize - index * lineHeight
    const options = {
      x: textX,
      y,
      size: element.fontSize,
      font,
      color: box.color,
      ...(element.fontStyle === 'italic' ? { xSkew: degrees(10) } : {})
    }
    page.drawText(line, options)
    if (element.fontWeight !== 'normal' && line) {
      page.drawText(line, { ...options, x: textX + 0.25 })
    }
    if (element.textDecoration === 'underline' && line) {
      page.drawLine({
        start: { x: textX, y: y - 1.5 },
        end: { x: textX + measuredWidth, y: y - 1.5 },
        thickness: 0.6,
        color: box.color
      })
    }
  })
}

function wrapText(
  text: string,
  font: PDFFont,
  fontSize: number,
  maxWidth: number
): string[] {
  const lines: string[] = []
  const paragraphs = text.split(/\r?\n/u)
  for (const paragraph of paragraphs) {
    let line = ''
    for (const segment of graphemeSegments(paragraph)) {
      const next = line + segment
      if (line && font.widthOfTextAtSize(next, fontSize) > maxWidth) {
        lines.push(line.trimEnd())
        line = segment.trimStart()
      } else {
        line = next
      }
    }
    lines.push(line)
  }
  return lines.length > 0 ? lines : ['']
}

function graphemeSegments(value: string): string[] {
  const segments: string[] = []
  for (const character of Array.from(value)) {
    if (/\p{Mark}/u.test(character) && segments.length > 0) {
      segments[segments.length - 1] += character
    } else {
      segments.push(character)
    }
  }
  return segments
}

function drawTable(
  page: PDFPage,
  pageHeight: number,
  element: CanonicalCanvasElementV2,
  rows: readonly (readonly string[])[],
  font: PDFFont,
  textColor: ReturnType<typeof rgb>
): void {
  const width = element.width ?? 0
  const columnCount = rows[0]?.length ?? 0
  if (
    width <= 0 ||
    columnCount === 0 ||
    rows.some((row) => row.length !== columnCount)
  ) {
    throw new Error('DOCUMENT_TABLE_LAYOUT_INVALID')
  }
  const fontSize = element.fontSize
  const rowHeight =
    (element.height ?? rows.length * (fontSize * 2 + 8)) / rows.length
  if (rowHeight < fontSize + 8) throw new Error('DOCUMENT_TABLE_LAYOUT_INVALID')
  const columnWidth = width / columnCount
  const totalHeight = rowHeight * rows.length
  const left = element.x
  const top = pageHeight - element.y
  const bottom = top - totalHeight
  const grid = rgb(0.79, 0.82, 0.86)
  page.drawRectangle({
    x: left,
    y: top - rowHeight,
    width,
    height: rowHeight,
    color: rgb(0.95, 0.96, 0.97)
  })
  for (let rowIndex = 0; rowIndex <= rows.length; rowIndex += 1) {
    const y = top - rowIndex * rowHeight
    page.drawLine({
      start: { x: left, y },
      end: { x: left + width, y },
      color: grid,
      thickness: 0.7
    })
  }
  for (let columnIndex = 0; columnIndex <= columnCount; columnIndex += 1) {
    const x = left + columnIndex * columnWidth
    page.drawLine({
      start: { x, y: top },
      end: { x, y: bottom },
      color: grid,
      thickness: 0.7
    })
  }
  rows.forEach((row, rowIndex) => {
    row.forEach((cell, columnIndex) => {
      const cellX = left + columnIndex * columnWidth
      const cellTop = top - rowIndex * rowHeight
      const pseudoElement: CanonicalCanvasElementV2 = {
        ...element,
        x: cellX,
        y: pageHeight - cellTop + 4,
        width: columnWidth,
        height: rowHeight - 8,
        fontWeight: rowIndex === 0 ? 'bold' : element.fontWeight,
        textAlign: 'center'
      }
      drawTextBox(page, pseudoElement, pageHeight, cell, font, {
        width: columnWidth,
        height: rowHeight - 8,
        padding: 3,
        color: textColor
      })
    })
  })
}

function drawShape(
  page: PDFPage,
  element: CanonicalCanvasElementV2,
  pageHeight: number,
  fillColor: ReturnType<typeof rgb> | undefined,
  borderColor: ReturnType<typeof rgb> | undefined
): void {
  const width = element.width ?? 1
  const height = element.height ?? 1
  const bottom = pageHeight - element.y - height
  const common = {
    x: element.x,
    y: bottom,
    width,
    height,
    ...(fillColor ? { color: fillColor } : {}),
    ...(borderColor && (element.borderWidth ?? 0) > 0
      ? { borderColor, borderWidth: element.borderWidth }
      : {})
  }
  if (element.shapeType === 'line') {
    page.drawLine({
      start: { x: element.x, y: bottom + height / 2 },
      end: { x: element.x + width, y: bottom + height / 2 },
      thickness: Math.max(0.5, element.borderWidth ?? height),
      color: borderColor ?? fillColor ?? color(element.color)
    })
  } else if (element.shapeType === 'circle') {
    page.drawEllipse({
      x: element.x + width / 2,
      y: bottom + height / 2,
      xScale: width / 2,
      yScale: height / 2,
      ...(fillColor ? { color: fillColor } : {}),
      ...(borderColor && (element.borderWidth ?? 0) > 0
        ? { borderColor, borderWidth: element.borderWidth }
        : {})
    })
  } else if (element.shapeType === 'star') {
    const path = starPath(width, height)
    page.drawSvgPath(path, {
      x: element.x,
      y: bottom,
      ...((fillColor ?? color(element.color))
        ? { color: fillColor ?? color(element.color) }
        : {}),
      ...(borderColor && (element.borderWidth ?? 0) > 0
        ? { borderColor, borderWidth: element.borderWidth }
        : {})
    })
  } else if ((element.borderRadius ?? 0) > 0) {
    page.drawSvgPath(
      roundedRectanglePath(width, height, element.borderRadius ?? 0),
      {
        x: element.x,
        y: bottom,
        ...(fillColor ? { color: fillColor } : {}),
        ...(borderColor && (element.borderWidth ?? 0) > 0
          ? { borderColor, borderWidth: element.borderWidth }
          : {})
      }
    )
  } else {
    page.drawRectangle(common)
  }
}

function drawBox(
  page: PDFPage,
  element: CanonicalCanvasElementV2,
  pageHeight: number,
  width: number,
  height: number,
  fillColor: ReturnType<typeof rgb> | undefined,
  borderColor: ReturnType<typeof rgb> | undefined
): void {
  const boxElement = {
    ...element,
    shapeType: 'rectangle' as const,
    width,
    height
  }
  drawShape(page, boxElement, pageHeight, fillColor, borderColor)
}

async function drawPng(
  pdf: PDFDocument,
  page: PDFPage,
  imageBytes: ReadonlyMap<string, Uint8Array>,
  key: string,
  box: {
    readonly x: number
    readonly y: number
    readonly width: number
    readonly height: number
    readonly pageHeight: number
  }
): Promise<void> {
  const bytes = imageBytes.get(key)
  if (!bytes) throw new Error('DOCUMENT_IMAGE_ASSET_NOT_FOUND')
  const image = await pdf.embedPng(bytes)
  if (!image.width || !image.height) throw new Error('DOCUMENT_IMAGE_INVALID')
  const scale = Math.min(box.width / image.width, box.height / image.height)
  const width = image.width * scale
  const height = image.height * scale
  page.drawImage(image, {
    x: box.x + (box.width - width) / 2,
    y: box.pageHeight - box.y - (box.height + height) / 2,
    width,
    height
  })
}

function aggregateCategory(
  snapshot: DocumentIssueSnapshotV1,
  category: 'hardSkill' | 'softSkill'
): { average: string; answeredCount: string } {
  const entries = snapshot.evaluations.flatMap((evaluation) => {
    const score = evaluation.categoryScores?.[category]
    return score ? [score] : []
  })
  const answeredCount = entries.reduce(
    (total, entry) => total + entry.answeredCount,
    0
  )
  const weightedSum = entries.reduce(
    (total, entry) => total + (entry.average ?? 0) * entry.answeredCount,
    0
  )
  return {
    average: answeredCount > 0 ? (weightedSum / answeredCount).toFixed(1) : '—',
    answeredCount: String(answeredCount)
  }
}

function formatThaiDate(value: string): string {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) throw new Error('DOCUMENT_DATE_INVALID')
  return new Intl.DateTimeFormat('th-TH-u-ca-buddhist', {
    dateStyle: 'long',
    timeZone: 'Asia/Bangkok'
  }).format(date)
}

function color(value: string): ReturnType<typeof rgb> {
  const hex = value.replace(/^#/u, '')
  if (!/^[\da-f]{6}$/iu.test(hex)) throw new Error('DOCUMENT_COLOR_INVALID')
  return rgb(
    Number.parseInt(hex.slice(0, 2), 16) / 255,
    Number.parseInt(hex.slice(2, 4), 16) / 255,
    Number.parseInt(hex.slice(4, 6), 16) / 255
  )
}

function roundedRectanglePath(
  width: number,
  height: number,
  radius: number
): string {
  const r = Math.min(radius, width / 2, height / 2)
  return `M ${r} 0 H ${width - r} Q ${width} 0 ${width} ${r} V ${height - r} Q ${width} ${height} ${width - r} ${height} H ${r} Q 0 ${height} 0 ${height - r} V ${r} Q 0 0 ${r} 0 Z`
}

function starPath(width: number, height: number): string {
  const centerX = width / 2
  const centerY = height / 2
  const outerRadius = Math.min(width, height) / 2
  const innerRadius = outerRadius * 0.42
  return (
    Array.from({ length: 10 }, (_unused, index) => {
      const angle = -Math.PI / 2 + (index * Math.PI) / 5
      const radius = index % 2 === 0 ? outerRadius : innerRadius
      const x = centerX + Math.cos(angle) * radius
      const y = centerY + Math.sin(angle) * radius
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
    }).join(' ') + ' Z'
  )
}
