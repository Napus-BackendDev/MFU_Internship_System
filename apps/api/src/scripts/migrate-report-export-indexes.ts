import { createConnection } from 'mongoose'

import { migrateReportExportIndexes } from '../reports/report-export-index-migration.js'

const uri = process.env.REPORT_EXPORT_MIGRATION_URI
const confirmation = process.argv.find((argument) =>
  argument.startsWith('--confirm-db=')
)
const confirmedDatabase = confirmation?.slice('--confirm-db='.length)
const apply = process.argv.includes('--apply')

if (!uri || !confirmedDatabase) {
  throw new Error(
    'Set REPORT_EXPORT_MIGRATION_URI and pass --confirm-db=<exact database name>; use --apply to create indexes.'
  )
}

const connection = await createConnection(uri, {
  autoIndex: false,
  serverSelectionTimeoutMS: 5000
}).asPromise()

try {
  if (connection.name !== confirmedDatabase) {
    throw new Error('CONFIRMED_DATABASE_MISMATCH')
  }
  const indexes = await migrateReportExportIndexes(connection, apply)
  console.log(
    JSON.stringify({
      database: connection.name,
      mode: apply ? 'apply' : 'dry-run',
      indexes
    })
  )
} finally {
  await connection.close()
}
