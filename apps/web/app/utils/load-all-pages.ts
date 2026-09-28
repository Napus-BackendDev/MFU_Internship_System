export interface PaginatedItems<T> {
  readonly items: T[]
  readonly meta: {
    readonly page: number
    readonly pageSize: number
    readonly total: number
    readonly totalPages: number
  }
}

function assertPageMetadata<T extends { readonly id: string }>(
  result: PaginatedItems<T>,
  page: number,
  pageSize: number,
  total: number,
  totalPages: number
): void {
  const expectedItems = Math.min(
    pageSize,
    Math.max(0, total - (page - 1) * pageSize)
  )
  if (
    result.meta.page !== page ||
    result.meta.pageSize !== pageSize ||
    result.meta.total !== total ||
    result.meta.totalPages !== totalPages ||
    result.items.length !== expectedItems
  ) {
    throw new Error('PAGINATED_LIST_CHANGED_DURING_READ')
  }
}

export async function loadAllPages<T extends { readonly id: string }>(
  loadPage: (page: number, pageSize: number) => Promise<PaginatedItems<T>>,
  pageSize = 100
): Promise<PaginatedItems<T>> {
  if (!Number.isInteger(pageSize) || pageSize < 1) {
    throw new Error('PAGINATION_PAGE_SIZE_INVALID')
  }

  const firstPage = await loadPage(1, pageSize)
  const { total, totalPages } = firstPage.meta
  const expectedTotalPages = Math.ceil(total / pageSize)
  if (
    !Number.isInteger(total) ||
    total < 0 ||
    totalPages !== expectedTotalPages
  ) {
    throw new Error('PAGINATION_METADATA_INVALID')
  }
  assertPageMetadata(firstPage, 1, pageSize, total, totalPages)

  const items = [...firstPage.items]
  const ids = new Set<string>()
  for (const item of items) {
    if (!item.id || ids.has(item.id)) {
      throw new Error('PAGINATED_LIST_ID_INVALID')
    }
    ids.add(item.id)
  }

  for (let page = 2; page <= totalPages; page += 1) {
    const result = await loadPage(page, pageSize)
    assertPageMetadata(result, page, pageSize, total, totalPages)
    for (const item of result.items) {
      if (!item.id || ids.has(item.id)) {
        throw new Error('PAGINATED_LIST_ID_INVALID')
      }
      ids.add(item.id)
      items.push(item)
    }
  }

  if (items.length !== total) {
    throw new Error('PAGINATED_LIST_INCOMPLETE')
  }

  return { ...firstPage, items }
}
