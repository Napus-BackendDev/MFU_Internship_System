import { createConnection } from 'mongoose'

import { migrateEmailTemplateIndexes } from '../correspondence/email-template-index-migration.js'

const uri = process.env.EMAIL_TEMPLATE_INDEX_MIGRATION_URI
const argumentsSet = new Set(process.argv.slice(2))
const confirmations = [...argumentsSet].filter((value) =>
  value.startsWith('--confirm-db=')
)
const allowedArguments = new Set(['--apply', ...confirmations])
if (
  [...argumentsSet].some((value) => !allowedArguments.has(value)) ||
  confirmations.length > 1 ||
  confirmations.some((value) => value === '--confirm-db=')
) {
  throw new Error('EMAIL_TEMPLATE_INDEX_MIGRATION_ARGUMENT_INVALID')
}

const apply = argumentsSet.has('--apply')
const confirmation = confirmations[0]
const confirmedDatabaseName = confirmation?.slice('--confirm-db='.length)
if (!uri) {
  throw new Error(
    'Set EMAIL_TEMPLATE_INDEX_MIGRATION_URI to the intended MongoDB target.'
  )
}
if (!apply && confirmation) {
  throw new Error('EMAIL_TEMPLATE_INDEX_CONFIRMATION_REQUIRES_APPLY')
}
if (apply && !confirmedDatabaseName) {
  throw new Error('EMAIL_TEMPLATE_INDEX_DATABASE_CONFIRMATION_REQUIRED')
}

const connection = await createConnection(uri, {
  autoIndex: false,
  maxPoolSize: 1,
  readPreference: 'primary',
  serverSelectionTimeoutMS: 5000
}).asPromise()

try {
  const report = await migrateEmailTemplateIndexes(connection, {
    apply,
    ...(confirmedDatabaseName ? { confirmedDatabaseName } : {})
  })
  console.log(JSON.stringify(report, null, 2))
  if (
    report.indexes.some(
      (index) => index.action === 'blocked' || index.action === 'conflict'
    )
  ) {
    process.exitCode = 1
  }
} finally {
  await connection.close()
}
