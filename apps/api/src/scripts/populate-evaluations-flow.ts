import crypto from 'node:crypto'
import { MongoClient, ObjectId, type Document } from 'mongodb'

interface TestStudent extends Document {
  studentId: string
  name?: { th?: string; en?: string }
  company?: string
}

interface TestAssignment extends Document {
  _id: ObjectId
  studentId: string
  evaluatorId: string
  status: string
  questionSnapshot?: unknown
  deadlineAt?: Date
  accessPin?: string
}

interface TestEvaluator extends Document {
  email?: string
}

interface TestEvaluation extends Document {
  assignmentId: string
  aggregateScore?: number
}

interface TestConfig {
  readonly apiBase: string
  readonly mongodbUri: string
  readonly authJwtSecret: string
}

function loadTestConfig(): TestConfig {
  if (process.env.ALLOW_MUTATING_EVALUATION_TEST_FLOW !== 'yes') {
    throw new Error(
      'Set ALLOW_MUTATING_EVALUATION_TEST_FLOW=yes to run this fixture.'
    )
  }
  const mongodbUri = process.env.TEST_MONGODB_URI
  const apiBase = process.env.TEST_API_BASE_URL
  const authJwtSecret = process.env.TEST_AUTH_JWT_SECRET
  if (!mongodbUri || !apiBase || !authJwtSecret) {
    throw new Error(
      'TEST_MONGODB_URI, TEST_API_BASE_URL, and TEST_AUTH_JWT_SECRET are required.'
    )
  }

  const mongoUrl = new URL(mongodbUri)
  const apiUrl = new URL(apiBase)
  const loopbackHosts = new Set(['localhost', '127.0.0.1', '[::1]'])
  if (
    !loopbackHosts.has(mongoUrl.hostname) ||
    mongoUrl.pathname !== '/internship_transcript_v2_test' ||
    !loopbackHosts.has(apiUrl.hostname) ||
    !apiUrl.pathname.endsWith('/api/v2')
  ) {
    throw new Error(
      'Evaluation fixtures are restricted to the local test database and API.'
    )
  }

  return { apiBase, mongodbUri, authJwtSecret }
}

function normalizePin(value: string): string {
  return value.replace(/[^A-Za-z0-9]/gu, '').toUpperCase()
}

function hashPin(pin: string, secret: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(normalizePin(pin))
    .digest('hex')
}

const STRENGTHS_POOL = [
  'นักศึกษามีความรับผิดชอบสูง ตรงต่อเวลา ทำงานร่วมกับทีมได้อย่างราบรื่น และเรียนรู้เทคโนโลยีใหม่ๆ ได้เร็วมาก',
  'มีทักษะการแก้ปัญหาเฉพาะหน้าได้ดี มีความคิดสร้างสรรค์ และมีความกระตือรือร้นในการทำงาน',
  'ปฏิบัติตามกฎระเบียบขององค์กรเป็นอย่างดี สื่อสารประสานงานกับเพื่อนร่วมงานและพี่เลี้ยงได้อย่างมีประสิทธิภาพ',
  'มีความละเอียดรอบคอบ ใส่ใจในคุณภาพของงาน และมีทัศนคติที่ดีต่องานที่ได้รับมอบหมาย',
  'สามารถประยุกต์ใช้ความรู้จากห้องเรียนมาปฏิบัติงานจริงได้อย่างดีเยี่ยม พร้อมรับฟังคำแนะนำเพื่อปรับปรุงงาน',
  'มีมนุษยสัมพันธ์ดีเยี่ยม เข้ากับเพื่อนร่วมงานได้ง่าย มีความอดทนและพร้อมรับมือกับความกดดันได้ดี'
]

const IMPROVEMENTS_POOL = [
  'ควรฝึกการนำเสนอและสื่อสารแนวคิดทางเทคนิคต่อบุคคลภายนอกหรือที่ประชุมเพิ่มเติม',
  'ควรเพิ่มความกล้าในการแสดงความคิดเห็นและการตั้งคำถามในระหว่างการประชุมทีม',
  'ควรศึกษาเครื่องมือและเทคโนโลยีเฉพาะทางเพิ่มเติมเพื่อเพิ่มความคล่องตัวในการปฏิบัติงาน',
  'ควรฝึกการบริหารจัดการเวลาเมื่อต้องรับผิดชอบหลายงานพร้อมกัน (Multitasking)',
  'ควรพัฒนาทักษะการเขียนรายงานและการจัดทำเอกสารประกอบการทำงานให้มีความเป็นมืออาชีพยิ่งขึ้น'
]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

async function runMockAndTestFlow(): Promise<void> {
  console.log('=== STARTING EVALUATION FORM MOCKUP & TEST FLOW ===\n')

  const config = loadTestConfig()
  const client = new MongoClient(config.mongodbUri)
  await client.connect()
  const db = client.db()

  // 1. Find inProgress assignments to test via HTTP API Flow
  const inProgressAssignments = await db
    .collection<TestAssignment>('evaluationAssignments')
    .find({ status: 'inProgress' })
    .toArray()

  console.log(`Found ${inProgressAssignments.length} inProgress assignments.`)

  // Test HTTP flow for the first 5 inProgress assignments
  const toSubmitViaHttp = inProgressAssignments.slice(0, 5)
  let httpSuccessCount = 0

  let i = 0
  for (const a of toSubmitViaHttp) {
    const assignmentId = a._id.toString()
    console.log(`\n[Test HTTP Flow ${i + 1}/5] Submitting a test assignment.`)

    // Dev Login as evaluator
    const loginRes = await fetch(`${config.apiBase}/auth/dev/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        role: 'evaluator',
        assignmentId,
        email: `evaluator_${i + 1}@workplace.co.th`,
        displayName: 'ผู้ประเมินสถานประกอบการ'
      })
    })

    if (!loginRes.ok) {
      console.error(`  Login failed (HTTP ${loginRes.status}).`)
      continue
    }

    const rawCookies = loginRes.headers.getSetCookie
      ? loginRes.headers.getSetCookie()
      : [loginRes.headers.get('set-cookie') || '']
    const cookies = rawCookies.map((c) => c.split(';')[0]).join('; ')

    // Prepare realistic ratings and feedback
    const punc = 4 + (i % 2)
    const team = 4 + ((i + 1) % 2)
    const resp = 5
    const tech = 3 + (i % 3)
    const prob = 4 + (i % 2)

    const fullAnswers: Record<string, unknown> = {
      punctuality: punc,
      teamwork: team,
      responsibility: resp,
      'technical-knowledge': tech,
      'problem-solving': prob,
      strengths: STRENGTHS_POOL[i % STRENGTHS_POOL.length],
      'areas-for-improvement': IMPROVEMENTS_POOL[i % IMPROVEMENTS_POOL.length]
    }

    const idempotencyKey = crypto.randomUUID()
    const submitRes = await fetch(
      `${config.apiBase}/evaluations/${assignmentId}/submit`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'idempotency-key': idempotencyKey,
          Cookie: cookies
        },
        body: JSON.stringify({ answers: fullAnswers })
      }
    )

    if (submitRes.ok) {
      const data: unknown = await submitRes.json()
      const evaluationId = isRecord(data)
        ? typeof data.id === 'string'
          ? data.id
          : 'created'
        : 'created'
      console.log(`  -> SUCCESS! Evaluation ID: ${evaluationId}`)
      httpSuccessCount++
    } else {
      console.error(`  -> Failed (HTTP ${submitRes.status}).`)
    }
    i++
  }

  console.log(
    `\nHTTP API Flow tests completed: ${httpSuccessCount}/5 succeeded.\n`
  )

  // 2. Ensure all submitted assignments in the database have a complete, valid evaluation record
  console.log(
    '--- Step 2: Populating Evaluation Records for all submitted assignments ---'
  )
  const allSubmittedAssignments = await db
    .collection<TestAssignment>('evaluationAssignments')
    .find({ status: 'submitted' })
    .toArray()

  console.log(
    `Total assignments with status 'submitted': ${allSubmittedAssignments.length}`
  )

  let createdCount = 0
  const now = new Date()

  let idx = 0
  for (const a of allSubmittedAssignments) {
    const assignmentId = a._id.toString()
    const existingEval = await db
      .collection<TestEvaluation>('evaluations')
      .findOne({ assignmentId })

    if (!existingEval) {
      const punc = 4 + (idx % 2)
      const team = 4 + ((idx + 1) % 2)
      const resp = 4 + (idx % 2)
      const tech = 3 + (idx % 3)
      const prob = 4 + ((idx + 2) % 2)
      const totalScore = punc + team + resp + tech + prob
      const aggregateScore = Math.round((totalScore / 25) * 100 * 100) / 100

      const answers = {
        punctuality: punc,
        teamwork: team,
        responsibility: resp,
        'technical-knowledge': tech,
        'problem-solving': prob,
        strengths: STRENGTHS_POOL[idx % STRENGTHS_POOL.length],
        'areas-for-improvement':
          IMPROVEMENTS_POOL[idx % IMPROVEMENTS_POOL.length]
      }

      const submittedAt = new Date(now.getTime() - (idx + 1) * 3600 * 1000 * 4) // Staggered over recent days
      const idempotencyKey = crypto.randomUUID()
      const payloadHash = crypto
        .createHash('sha256')
        .update(JSON.stringify(answers))
        .digest('hex')

      await db.collection<TestEvaluation>('evaluations').insertOne({
        assignmentId,
        version: 1,
        answers,
        questionSnapshot: a.questionSnapshot,
        aggregateScore,
        evaluatorId: a.evaluatorId,
        submittedAt,
        idempotencyKey,
        idempotencyScopeKey: `evaluator:${a.evaluatorId}:evaluation:${assignmentId}:${idempotencyKey}`,
        requestHash: payloadHash,
        createdAt: submittedAt,
        updatedAt: submittedAt
      })
      createdCount++
    }
    idx++
  }
  console.log(
    `Created ${createdCount} evaluation records for submitted assignments.`
  )

  // 3. Setup Invitations & PIN hashes for remaining inProgress assignments
  console.log(
    '\n--- Step 3: Ensuring PIN verification & Invitations work for inProgress assignments ---'
  )
  const remainingInProgress = await db
    .collection<TestAssignment>('evaluationAssignments')
    .find({ status: 'inProgress' })
    .toArray()

  console.log(`Remaining inProgress assignments: ${remainingInProgress.length}`)

  let pinUpdatedCount = 0
  for (const a of remainingInProgress) {
    if (a.accessPin) {
      const pinHash = hashPin(a.accessPin, config.authJwtSecret)
      await db
        .collection<TestAssignment>('evaluationAssignments')
        .updateOne({ _id: a._id }, { $set: { accessPinHash: pinHash } })

      const evaluator = await db
        .collection<TestEvaluator>('evaluators')
        .findOne({ _id: new ObjectId(a.evaluatorId) })
      await db.collection('invitations').updateOne(
        { assignmentId: a._id.toString() },
        {
          $set: {
            assignmentId: a._id.toString(),
            evaluatorId: a.evaluatorId,
            email: evaluator?.email || 'evaluator@workplace.co.th',
            accessPinHash: pinHash,
            status: 'active',
            expiresAt:
              a.deadlineAt || new Date(now.getTime() + 30 * 24 * 3600 * 1000),
            updatedAt: now
          },
          $setOnInsert: {
            createdAt: now
          }
        },
        { upsert: true }
      )
      pinUpdatedCount++
    }
  }
  console.log(
    `Updated PIN hashes and active invitations for ${pinUpdatedCount} assignments.`
  )

  // Test one PIN verification directly via Public API
  const firstWithPin = remainingInProgress.find((r) => r.accessPin)
  if (firstWithPin && firstWithPin.accessPin) {
    const testPin = firstWithPin.accessPin
    console.log('\nTesting public PIN verification with a fixture PIN...')
    const pinRes = await fetch(
      `${config.apiBase}/public/evaluations/verify-pin`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: testPin })
      }
    )
    console.log(`Public PIN verification status: ${pinRes.status}.`)
    if (!pinRes.ok) console.error('  -> PIN verification failed.')
  }

  // 4. Final Summary
  const totalEvals = await db
    .collection<TestEvaluation>('evaluations')
    .countDocuments()
  const assignments = db.collection<TestAssignment>('evaluationAssignments')
  const totalAssignments = await assignments.countDocuments()
  const submittedAssignments = await assignments.countDocuments({
    status: 'submitted'
  })
  const inProgressCount = await assignments.countDocuments({
    status: 'inProgress'
  })
  const pendingCount = await assignments.countDocuments({ status: 'pending' })
  const submittedStudents = await db
    .collection<TestStudent>('students')
    .countDocuments({ evaluationStatus: 'submitted' })

  console.log('\n================ FINAL SYSTEM STATE ================')
  console.log(`Total Assignments: ${totalAssignments}`)
  console.log(`  - Submitted: ${submittedAssignments}`)
  console.log(`  - In Progress: ${inProgressCount}`)
  console.log(`  - Pending: ${pendingCount}`)
  console.log(`Total Evaluation Records in DB: ${totalEvals}`)
  console.log(
    `Total Students with evaluationStatus = 'submitted': ${submittedStudents}`
  )
  console.log('====================================================\n')

  await client.close()
}

runMockAndTestFlow().catch(console.error)
