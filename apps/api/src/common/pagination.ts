import type { Paginated } from '@internship/shared-types'
import type { ClientSession, Model, QueryFilter } from 'mongoose'

export interface PaginationInput {
  readonly page: number
  readonly pageSize: number
}

export async function paginate<T>(
  model: Model<T>,
  filter: QueryFilter<T>,
  input: PaginationInput,
  sort: Readonly<Record<string, 1 | -1>> = { createdAt: -1, _id: -1 },
  session?: ClientSession
): Promise<Paginated<Readonly<Record<string, unknown>>>> {
  const documentsQuery = model
    .find(filter)
    .sort(sort)
    .skip((input.page - 1) * input.pageSize)
    .limit(input.pageSize)
  const totalQuery = model.countDocuments(filter)
  if (session) {
    documentsQuery.session(session)
    totalQuery.session(session)
  }
  let documents: Awaited<ReturnType<typeof documentsQuery.exec>>
  let total: number
  if (session) {
    documents = await documentsQuery.exec()
    total = await totalQuery.exec()
  } else {
    ;[documents, total] = await Promise.all([
      documentsQuery.exec(),
      totalQuery.exec()
    ])
  }

  return {
    items: documents.map(
      (document) => document.toJSON() as Readonly<Record<string, unknown>>
    ),
    meta: {
      page: input.page,
      pageSize: input.pageSize,
      total,
      totalPages: Math.ceil(total / input.pageSize)
    }
  }
}
