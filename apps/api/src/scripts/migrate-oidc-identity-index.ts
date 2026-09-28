import { createConnection } from 'mongoose'

import { migrateOidcIdentityIndex } from '../auth/oidc-identity-index-migration.js'

const uri = process.env.OIDC_IDENTITY_INDEX_MIGRATION_URI
if (!uri) {
  throw new Error(
    'Set OIDC_IDENTITY_INDEX_MIGRATION_URI to the intended MongoDB target. Default mode is read-only.'
  )
}

const argumentsSet = new Set(process.argv.slice(2))
const confirmationArguments = [...argumentsSet].filter((value) =>
  value.startsWith('--confirm-db=')
)
const allowedArguments = new Set(['--apply', ...confirmationArguments])
if (
  [...argumentsSet].some((value) => !allowedArguments.has(value)) ||
  confirmationArguments.length > 1 ||
  confirmationArguments.some((value) => value === '--confirm-db=')
) {
  throw new Error('OIDC_IDENTITY_INDEX_MIGRATION_ARGUMENT_INVALID')
}

const apply = argumentsSet.has('--apply')
const confirmation = [...argumentsSet].find((value) =>
  value.startsWith('--confirm-db=')
)
const confirmedDatabaseName = confirmation?.slice('--confirm-db='.length)
if (!apply && confirmation) {
  throw new Error('OIDC_IDENTITY_INDEX_CONFIRMATION_REQUIRES_APPLY')
}
if (apply && !confirmedDatabaseName) {
  throw new Error('OIDC_IDENTITY_INDEX_DATABASE_CONFIRMATION_REQUIRED')
}

const connection = await createConnection(uri, {
  autoIndex: false,
  maxPoolSize: 1,
  readPreference: 'primary',
  serverSelectionTimeoutMS: 5000
}).asPromise()

try {
  const report = await migrateOidcIdentityIndex(connection, {
    apply,
    ...(confirmedDatabaseName ? { confirmedDatabaseName } : {})
  })
  console.log(JSON.stringify(report, null, 2))
  if (
    report.identityIndex.status === 'blocked' ||
    report.identityIndex.status === 'conflict' ||
    report.invalidIdentityCount > 0 ||
    report.duplicateIdentityGroupCount > 0
  ) {
    process.exitCode = 1
  }
} finally {
  await connection.close()
}
