import { createConnection } from 'mongoose'

import { migrateStudentEmailUniqueIndex } from '../members/student-email-preflight.js'

const uri = process.env.STUDENT_EMAIL_MIGRATION_URI
if (!uri) {
  throw new Error(
    'Set STUDENT_EMAIL_MIGRATION_URI to the intended MongoDB target. Default mode is read-only.'
  )
}

const argumentsSet = new Set(process.argv.slice(2))
const allowedArguments = new Set([
  '--apply',
  '--writes-paused',
  ...[...argumentsSet].filter((value) => value.startsWith('--confirm-db='))
])
if ([...argumentsSet].some((value) => !allowedArguments.has(value))) {
  throw new Error('STUDENT_EMAIL_MIGRATION_ARGUMENT_INVALID')
}
const apply = argumentsSet.has('--apply')
const confirmation = [...argumentsSet].find((value) =>
  value.startsWith('--confirm-db=')
)
const confirmedDatabaseName = confirmation?.slice('--confirm-db='.length)
const writesPaused = argumentsSet.has('--writes-paused')
if (!apply && (confirmation || writesPaused)) {
  throw new Error('STUDENT_EMAIL_MIGRATION_FLAGS_REQUIRE_APPLY')
}

const connection = await createConnection(uri, {
  maxPoolSize: 1,
  readPreference: 'primary',
  serverSelectionTimeoutMS: 5000
}).asPromise()

try {
  const report = await migrateStudentEmailUniqueIndex(connection, {
    apply,
    ...(confirmedDatabaseName ? { confirmedDatabaseName } : {}),
    writesPaused
  })
  console.log(JSON.stringify(report, null, 2))
} finally {
  await connection.close()
}
