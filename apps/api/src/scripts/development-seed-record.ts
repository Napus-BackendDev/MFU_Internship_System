import { ObjectId, type Db } from 'mongodb'

export async function upsertDevelopmentRecord(
  database: Db,
  collection: string,
  filter: Readonly<Record<string, unknown>>,
  document: Readonly<Record<string, unknown>>,
  unsetFields: readonly string[] = []
): Promise<string> {
  const insertOnly = ['documentTemplates', 'documentTemplateVersions'].includes(
    collection
  )
  const update = {
    ...(insertOnly
      ? { $setOnInsert: { _id: new ObjectId(), ...document } }
      : { $set: document, $setOnInsert: { _id: new ObjectId() } }),
    ...(unsetFields.length > 0
      ? { $unset: Object.fromEntries(unsetFields.map((field) => [field, ''])) }
      : {})
  }
  const result = await database
    .collection(collection)
    .findOneAndUpdate(filter, update, { upsert: true, returnDocument: 'after' })
  if (!result) throw new Error(`Failed to seed ${collection}.`)
  return result._id.toString()
}
