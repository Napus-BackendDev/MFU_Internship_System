import { createConnection } from 'mongoose'

import { migrateAuditScopeIndexes } from '../audit/audit-index-migration.js'

const uri = process.env.AUDIT_SCOPE_MIGRATION_URI
if (!uri) {
  throw new Error(
    'Set AUDIT_SCOPE_MIGRATION_URI to the intended MongoDB target. Default mode is read-only.'
  )
}

const argumentsSet = new Set(process.argv.slice(2))
const allowedArguments = new Set([
  '--apply',
  ...[...argumentsSet].filter((value) => value.startsWith('--confirm-db='))
])
if ([...argumentsSet].some((value) => !allowedArguments.has(value))) {
  throw new Error('AUDIT_SCOPE_INDEX_MIGRATION_ARGUMENT_INVALID')
}
const apply = argumentsSet.has('--apply')
const confirmation = [...argumentsSet].find((value) =>
  value.startsWith('--confirm-db=')
)
const confirmedDatabaseName = confirmation?.slice('--confirm-db='.length)
if (!apply && confirmation) {
  throw new Error('AUDIT_SCOPE_INDEX_CONFIRMATION_REQUIRES_APPLY')
}
if (apply && !confirmedDatabaseName) {
  throw new Error('AUDIT_SCOPE_INDEX_DATABASE_CONFIRMATION_REQUIRED')
}

const connection = await createConnection(uri, {
  maxPoolSize: 1,
  readPreference: 'primary',
  serverSelectionTimeoutMS: 5000
}).asPromise()

try {
  const report = await migrateAuditScopeIndexes(connection, {
    apply,
    ...(confirmedDatabaseName ? { confirmedDatabaseName } : {})
  })
  console.log(JSON.stringify(report, null, 2))
} finally {
  await connection.close()
}
