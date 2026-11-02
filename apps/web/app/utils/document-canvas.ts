export interface CanvasRect {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export interface LabeledCanvasRect extends CanvasRect {
  readonly id: string
}

export interface CanvasGuide {
  readonly axis: 'x' | 'y'
  readonly position: number
  readonly kind: 'center' | 'smart'
}

export interface CanvasDistance {
  readonly axis: 'x' | 'y'
  /** Fixed coordinate of the measuring line on the other axis. */
  readonly at: number
  readonly from: number
  readonly to: number
}

export interface CanvasSnapResult {
  readonly dx: number
  readonly dy: number
  readonly guides: readonly CanvasGuide[]
  readonly distances: readonly CanvasDistance[]
}

function axisPoints(rect: CanvasRect, axis: 'x' | 'y'): readonly number[] {
  const start = axis === 'x' ? rect.x : rect.y
  const size = axis === 'x' ? rect.width : rect.height
  return [start, start + size / 2, start + size]
}

function snapAxis(
  moving: CanvasRect,
  others: readonly CanvasRect[],
  pageSize: number,
  axis: 'x' | 'y',
  threshold: number
): { readonly delta: number; readonly guides: readonly CanvasGuide[] } {
  const points = axisPoints(moving, axis)
  const pageCenter = pageSize / 2
  const targets = [
    { position: pageCenter, kind: 'center' as const },
    ...others.flatMap((other) =>
      axisPoints(other, axis).map((position) => ({
        position,
        kind: 'smart' as const
      }))
    )
  ]
  let delta = 0
  let best = threshold + 1
  for (const target of targets) {
    for (const point of points) {
      const distance = Math.abs(target.position - point)
      if (distance < best) {
        best = distance
        delta = target.position - point
      }
    }
  }
  if (best > threshold) return { delta: 0, guides: [] }
  const snapped = points.map((point) => point + delta)
  const seen = new Set<number>()
  const guides: CanvasGuide[] = []
  for (const target of targets) {
    if (
      !seen.has(target.position) &&
      snapped.some((point) => Math.abs(point - target.position) < 0.5)
    ) {
      seen.add(target.position)
      guides.push({ axis, position: target.position, kind: target.kind })
    }
  }
  return { delta, guides }
}

/** Distance from the moving box to the nearest neighbour on each of its four sides. */
export function measureDistances(
  moving: CanvasRect,
  others: readonly CanvasRect[]
): CanvasDistance[] {
  const overlapsOn = (
    a: CanvasRect,
    b: CanvasRect,
    axis: 'x' | 'y'
  ): boolean =>
    axis === 'x'
      ? a.x < b.x + b.width && b.x < a.x + a.width
      : a.y < b.y + b.height && b.y < a.y + a.height
  const nearest = (
    gaps: readonly { readonly from: number; readonly to: number }[]
  ): { readonly from: number; readonly to: number } | undefined =>
    gaps
      .filter((gap) => gap.to > gap.from)
      .sort((a, b) => a.to - a.from - (b.to - b.from))[0]

  const rows = others.filter((other) => overlapsOn(moving, other, 'y'))
  const columns = others.filter((other) => overlapsOn(moving, other, 'x'))
  const midY = moving.y + moving.height / 2
  const midX = moving.x + moving.width / 2
  const candidates: (CanvasDistance | undefined)[] = [
    withLine(
      nearest(rows.map((o) => ({ from: o.x + o.width, to: moving.x }))),
      'x',
      midY
    ),
    withLine(
      nearest(rows.map((o) => ({ from: moving.x + moving.width, to: o.x }))),
      'x',
      midY
    ),
    withLine(
      nearest(columns.map((o) => ({ from: o.y + o.height, to: moving.y }))),
      'y',
      midX
    ),
    withLine(
      nearest(
        columns.map((o) => ({ from: moving.y + moving.height, to: o.y }))
      ),
      'y',
      midX
    )
  ]
  return candidates.filter((item): item is CanvasDistance => Boolean(item))
}

function withLine(
  gap: { readonly from: number; readonly to: number } | undefined,
  axis: 'x' | 'y',
  at: number
): CanvasDistance | undefined {
  return gap ? { axis, at, from: gap.from, to: gap.to } : undefined
}

export function snapToGuides(
  moving: CanvasRect,
  others: readonly CanvasRect[],
  page: { readonly width: number; readonly height: number },
  threshold = 5
): CanvasSnapResult {
  const x = snapAxis(moving, others, page.width, 'x', threshold)
  const y = snapAxis(moving, others, page.height, 'y', threshold)
  const snapped = { ...moving, x: moving.x + x.delta, y: moving.y + y.delta }
  return {
    dx: x.delta,
    dy: y.delta,
    guides: [...x.guides, ...y.guides],
    distances: measureDistances(snapped, others)
  }
}

export function boundingRect(rects: readonly CanvasRect[]): CanvasRect {
  const left = Math.min(...rects.map((rect) => rect.x))
  const top = Math.min(...rects.map((rect) => rect.y))
  const right = Math.max(...rects.map((rect) => rect.x + rect.width))
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.height))
  return { x: left, y: top, width: right - left, height: bottom - top }
}

export function rectsIntersect(a: CanvasRect, b: CanvasRect): boolean {
  return (
    a.x < b.x + b.width &&
    b.x < a.x + a.width &&
    a.y < b.y + b.height &&
    b.y < a.y + a.height
  )
}

export function findOverlappingPairs(
  rects: readonly LabeledCanvasRect[]
): [string, string][] {
  const pairs: [string, string][] = []
  rects.forEach((first, index) => {
    for (const second of rects.slice(index + 1)) {
      if (rectsIntersect(first, second)) pairs.push([first.id, second.id])
    }
  })
  return pairs
}

export type ResizeHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

export function resizeRect(
  start: CanvasRect,
  handle: ResizeHandle,
  dx: number,
  dy: number,
  limits: {
    readonly pageWidth: number
    readonly pageHeight: number
    readonly minWidth: number
    readonly minHeight: number
  }
): CanvasRect {
  const right = start.x + start.width
  const bottom = start.y + start.height
  let { x, y, width, height } = start
  if (handle.includes('e')) {
    width = Math.min(
      limits.pageWidth - x,
      Math.max(limits.minWidth, width + dx)
    )
  }
  if (handle.includes('s')) {
    height = Math.min(
      limits.pageHeight - y,
      Math.max(limits.minHeight, height + dy)
    )
  }
  if (handle.includes('w')) {
    x = Math.max(0, Math.min(right - limits.minWidth, x + dx))
    width = right - x
  }
  if (handle.includes('n')) {
    y = Math.max(0, Math.min(bottom - limits.minHeight, y + dy))
    height = bottom - y
  }
  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(width),
    height: Math.round(height)
  }
}

interface NormalizableElement {
  id: string
  type: string
  x: number
  y: number
  width?: number
  height?: number
  fontSize: number
  fontFamily?: string
  borderRadius?: number
  shapeType?: string
  tableData?: unknown
  borderWidth?: number
  padding?: number
  variableKey?: string
  assetKey?: string
  assetKeys?: string[]
}

function cleanNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : undefined
}

/**
 * Brings an edited element inside what the template schema accepts: dragging or
 * typing can leave it off the page or with empty numeric inputs, and saving must
 * not fail with a generic validation error for something this harmless.
 */
export function normalizeCanvasElement<T extends NormalizableElement>(
  element: T,
  page: { readonly width: number; readonly height: number },
  documentFontFamily?: string
): T {
  const next = { ...element }
  const width = cleanNumber(next.width)
  const height = cleanNumber(next.height)
  const clampedWidth =
    width === undefined ? undefined : Math.min(width, page.width)
  const clampedHeight =
    height === undefined ? undefined : Math.min(height, page.height)
  next.x = Math.round(
    Math.min(Math.max(0, Number(next.x) || 0), page.width - (clampedWidth ?? 0))
  )
  next.y = Math.round(
    Math.min(
      Math.max(0, Number(next.y) || 0),
      page.height - (clampedHeight ?? 0)
    )
  )
  if (clampedWidth === undefined) delete next.width
  else next.width = clampedWidth
  if (clampedHeight === undefined) delete next.height
  else next.height = clampedHeight
  next.fontSize = Math.min(256, Math.max(1, Number(next.fontSize) || 12))
  // A cleared number input reports '', which the schema rejects.
  if (next.borderWidth !== undefined) {
    next.borderWidth = Math.min(32, Math.max(0, Number(next.borderWidth) || 0))
  }
  if (next.padding !== undefined) {
    next.padding = Math.min(256, Math.max(0, Number(next.padding) || 0))
  }
  if (next.type === 'shape') {
    next.width ??= Math.min(100, page.width - next.x)
    next.height ??= Math.min(100, page.height - next.y)
  }
  if (next.borderRadius !== undefined) {
    next.borderRadius = Math.min(
      9999,
      Math.max(0, Number(next.borderRadius) || 0)
    )
  }
  if (documentFontFamily) next.fontFamily = documentFontFamily
  if (next.type !== 'shape') delete next.shapeType
  if (next.type !== 'custom_table') delete next.tableData
  if (next.type !== 'variable') delete next.variableKey
  if (next.type !== 'emblem') delete next.assetKey
  if (next.type !== 'signature') delete next.assetKeys
  return next
}

/** Layout the PDF renderer uses for score and custom tables, shared with the designer preview. */
export function tableRowHeight(
  element: { readonly height?: number; readonly fontSize: number },
  rowCount: number
): number {
  return (element.height ?? rowCount * (element.fontSize * 2 + 8)) / rowCount
}

const LEGACY_SCORE_ROWS: Readonly<Record<string, readonly [string, string]>> = {
  'Hard Skill': ['{{hard_skill_score}}', '{{hard_skill_max_score}}'],
  'Soft Skill': ['{{soft_skill_score}}', '{{soft_skill_max_score}}']
}

/** Older score tables stored a literal "—" per cell, so they printed no scores at all. */
export function upgradeLegacyScoreTable<
  T extends {
    type: string
    tableData?: { headers: string[]; rows: string[][] }
  }
>(element: T): T {
  const table = element.tableData
  if (
    element.type !== 'custom_table' ||
    table?.headers[1] !== 'คะแนนเฉลี่ย' ||
    table.headers.length !== 3 ||
    !table.rows.every(
      (row) =>
        LEGACY_SCORE_ROWS[row[0] ?? ''] && row[1] === '—' && row[2] === '—'
    )
  ) {
    return element
  }
  return {
    ...element,
    tableData: {
      headers: ['หมวดทักษะ', 'คะแนนที่ได้ (Earned Score)', 'คะแนนเต็ม'],
      rows: table.rows.map((row) => [
        row[0] ?? '',
        ...(LEGACY_SCORE_ROWS[row[0] ?? ''] ?? ['', ''])
      ])
    }
  }
}
