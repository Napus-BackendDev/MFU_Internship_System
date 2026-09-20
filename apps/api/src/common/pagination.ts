import type { Paginated } from '@internship/shared-types'
import type { Model, QueryFilter } from 'mongoose'

export interface PaginationInput {
  readonly page: number
  readonly pageSize: number
}

export async function paginate<T>(
  model: Model<T>,
  filter: QueryFilter<T>,
  input: PaginationInput,
  sort: Readonly<Record<string, 1 | -1>> = { createdAt: -1, _id: -1 }
): Promise<Paginated<Readonly<Record<string, unknown>>>> {
  const [documents, total] = await Promise.all([
    model
      .find(filter)
      .sort(sort)
      .skip((input.page - 1) * input.pageSize)
      .limit(input.pageSize)
      .exec(),
    model.countDocuments(filter).exec()
  ])

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
