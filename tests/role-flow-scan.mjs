/**
 * Full Role Flow Scan & Usability Verification
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { MongoClient } = require('../node_modules/.pnpm/mongodb@7.5.0/node_modules/mongodb/lib/index.js');

const API_BASE = 'http://localhost:8081/api/v2';
const MONGO_URI = 'mongodb://127.0.0.1:27017/internship_transcript_v2_dev';

const report = {
  roles: {},
  bugs: [],
  warnings: []
};

function recordBug(role, feature, message, details) {
  const bug = { role, feature, message, details };
  report.bugs.push(bug);
  console.error(`[BUG][${role}][${feature}] ${message}`, details || '');
}

function recordPass(role, feature, message) {
  if (!report.roles[role]) report.roles[role] = [];
  report.roles[role].push({ feature, message, status: 'PASS' });
  console.log(`[PASS][${role}][${feature}] ${message}`);
}

async function devLogin(email, role, extra = {}) {
  const res = await fetch(`${API_BASE}/auth/dev/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, role, displayName: extra.displayName || role, ...extra })
  });
  if (!res.ok) throw new Error(`Login failed for ${role}: ${res.status} ${await res.text()}`);
  const setCookie = res.headers.get('set-cookie');
  const cookies = [];
  if (setCookie) {
    for (const part of setCookie.split(',')) {
      const match = part.match(/(its_[a-z]+=[^;]+)/i);
      if (match) cookies.push(match[1]);
    }
  }
  return { actor: (await res.json()).actor, cookie: cookies.join('; ') };
}

async function get(path, cookie) {
  return fetch(`${API_BASE}${path}`, {
    headers: {
      'Cookie': cookie,
      'x-requested-with': 'XMLHttpRequest',
      'Accept': 'application/json'
    }
  });
}

async function post(path, cookie, body = {}) {
  return fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Cookie': cookie,
      'x-requested-with': 'XMLHttpRequest',
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify(body)
  });
}

async function run() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db();

  console.log('Connected to MongoDB. Starting multi-role scan...');

  // ==================== 1. SYSTEM ADMIN ====================
  console.log('\n=== 1. System Administrator Role ===');
  const admin = await devLogin('admin@mfu.ac.th', 'systemAdmin', { displayName: 'System Admin' });
  recordPass('systemAdmin', 'Auth', 'Logged in successfully');

  // Overview
  const overviewRes = await get('/reports/overview', admin.cookie);
  if (overviewRes.ok) {
    const data = await overviewRes.json();
    recordPass('systemAdmin', 'Overview', `Overview metrics: students=${data.students}, readyDocs=${data.readyDocuments}`);
  } else {
    recordBug('systemAdmin', 'Overview', `GET /reports/overview failed: ${overviewRes.status}`, await overviewRes.text());
  }

  // Students list
  const studentsRes = await get('/students?page=1&pageSize=25', admin.cookie);
  let sampleStudent = null;
  if (studentsRes.ok) {
    const data = await studentsRes.json();
    recordPass('systemAdmin', 'Students', `Loaded ${data.items?.length} students, total=${data.meta?.total}`);
    sampleStudent = data.items?.[0];
  } else {
    recordBug('systemAdmin', 'Students', `GET /students failed: ${studentsRes.status}`, await studentsRes.text());
  }

  // Student single detail
  if (sampleStudent) {
    const singleRes = await get(`/students/${sampleStudent.id}`, admin.cookie);
    if (singleRes.ok) {
      recordPass('systemAdmin', 'Students', `GET /students/${sampleStudent.id} succeeded`);
    } else {
      recordBug('systemAdmin', 'Students', `GET /students/${sampleStudent.id} failed: ${singleRes.status}`, await singleRes.text());
    }
  }

  // Academic Schools, Programs, Terms, Cycles
  for (const [endpoint, label] of [
    ['/academic/schools', 'Schools'],
    ['/academic/programs', 'Programs'],
    ['/academic/terms', 'Terms'],
    ['/evaluation-cycles', 'Cycles'],
    ['/evaluation-assignments', 'Assignments'],
    ['/document-templates', 'Templates'],
    ['/generated-documents', 'Generated Documents'],
    ['/users', 'Users'],
    ['/users/summary', 'Users Summary'],
    ['/audit-logs', 'Audit Logs'],
    ['/system-settings/provinces', 'Provinces'],
    ['/system-settings/general', 'General Config']
  ]) {
    const res = await get(`${endpoint}?page=1&pageSize=25`, admin.cookie);
    if (res.ok) {
      recordPass('systemAdmin', label, `GET ${endpoint} returned 200 OK`);
    } else {
      recordBug('systemAdmin', label, `GET ${endpoint} returned ${res.status}`, await res.text());
    }
  }

  // ==================== 2. ADVISOR / COORDINATOR ====================
  console.log('\n=== 2. Advisor / Coordinator Role ===');
  const advisor = await devLogin('advisor@mfu.ac.th', 'coordinator', { displayName: 'Dr. Advisor' });
  recordPass('coordinator', 'Auth', 'Logged in successfully');

  const coordOverview = await get('/reports/overview', advisor.cookie);
  if (coordOverview.ok) {
    recordPass('coordinator', 'Overview', 'Coordinator overview returned 200 OK');
  } else {
    recordBug('coordinator', 'Overview', `Coordinator overview returned ${coordOverview.status}`, await coordOverview.text());
  }

  const coordStudents = await get('/students?page=1&pageSize=25', advisor.cookie);
  if (coordStudents.ok) {
    recordPass('coordinator', 'Students', 'Coordinator students list returned 200 OK');
  } else {
    recordBug('coordinator', 'Students', `Coordinator students list returned ${coordStudents.status}`, await coordStudents.text());
  }

  // ==================== 3. STUDENT ====================
  console.log('\n=== 3. Student Role ===');
  // Find a student from DB that has an assignment and placement
  const studentDoc = await db.collection('students').findOne({});
  const studentId = studentDoc ? studentDoc.studentId : '6531501009';
  console.log(`Testing with student ID: ${studentId} (mongo _id: ${studentDoc?._id})`);

  const student = await devLogin('student@lamduan.mfu.ac.th', 'student', {
    displayName: studentDoc?.name?.en || 'Student User',
    studentId
  });
  recordPass('student', 'Auth', 'Logged in as student');

  // Student fetching own directory data
  const sDirectory = await get(`/students?studentId=${studentId}&pageSize=50&includeDirectoryData=true`, student.cookie);
  if (sDirectory.ok) {
    const sData = await sDirectory.json();
    recordPass('student', 'Directory', `Student retrieved own profile (found: ${sData.items?.length})`);
  } else {
    recordBug('student', 'Directory', `Student /students?studentId=${studentId} returned ${sDirectory.status}`, await sDirectory.text());
  }

  // Student fetching placements
  const sPlacements = await get('/placements?page=1&pageSize=25', student.cookie);
  if (sPlacements.ok) {
    const pData = await sPlacements.json();
    recordPass('student', 'Placements', `Student retrieved placements (${pData.items?.length} items)`);
  } else {
    recordBug('student', 'Placements', `Student /placements returned ${sPlacements.status}`, await sPlacements.text());
  }

  // Student fetching assignments
  const sAssignments = await get('/evaluation-assignments?page=1&pageSize=25', student.cookie);
  let targetAssignmentId = null;
  if (sAssignments.ok) {
    const aData = await sAssignments.json();
    recordPass('student', 'Assignments', `Student retrieved assignments (${aData.items?.length} items)`);
    if (aData.items?.length > 0) targetAssignmentId = aData.items[0].id;
  } else {
    recordBug('student', 'Assignments', `Student /evaluation-assignments returned ${sAssignments.status}`, await sAssignments.text());
  }

  // Student fetching generated documents
  const sDocs = await get('/generated-documents?page=1&pageSize=25', student.cookie);
  if (sDocs.ok) {
    const dData = await sDocs.json();
    recordPass('student', 'Documents', `Student retrieved generated documents (${dData.items?.length} items)`);
  } else {
    recordBug('student', 'Documents', `Student /generated-documents returned ${sDocs.status}`, await sDocs.text());
  }

  // Student fetching evaluation detail for benchmark chart
  if (targetAssignmentId) {
    const sEval = await get(`/evaluations/${targetAssignmentId}`, student.cookie);
    if (sEval.ok) {
      recordPass('student', 'Benchmark', `Student retrieved evaluation detail for assignment ${targetAssignmentId}`);
    } else {
      recordBug('student', 'Benchmark', `Student /evaluations/${targetAssignmentId} returned ${sEval.status}`, await sEval.text());
    }
  }

  // ==================== 4. EVALUATOR (PIN FLOW) ====================
  console.log('\n=== 4. External Evaluator (PIN Flow) ===');
  // Check how PIN is generated or tested
  // Let's inspect invitations collection
  const invitations = await db.collection('invitations').find({}).limit(5).toArray();
  console.log(`Found ${invitations.length} invitations in DB`);
  if (invitations.length > 0) {
    console.log('Sample invitation keys:', Object.keys(invitations[0]));
  }

  // Test invalid PIN behavior
  const invalidPinRes = await post('/public/evaluations/verify-pin', '', { pin: 'INVALIDPIN123456' });
  if (invalidPinRes.status === 400 || invalidPinRes.status === 401 || invalidPinRes.status === 404) {
    recordPass('evaluator', 'PIN Verification', `Invalid PIN correctly rejected with ${invalidPinRes.status}`);
  } else {
    recordBug('evaluator', 'PIN Verification', `Unexpected status for invalid PIN: ${invalidPinRes.status}`, await invalidPinRes.text());
  }

  // Let's create a test PIN in the database for an existing assignment to test the real evaluator flow!
  const assignmentForEval = await db.collection('evaluationAssignments').findOne({ status: { $in: ['pending', 'inProgress'] } });
  if (assignmentForEval) {
    console.log(`Found pending/inProgress assignment: ${assignmentForEval._id}`);
    const crypto = await import('node:crypto');
    const testPinPlain = 'TE' + crypto.randomBytes(7).toString('hex').toUpperCase();
    const pepper = 'development-only-token-pepper-never-use-in-production';
    const digest = crypto.createHmac('sha256', pepper).update(`internship-evaluation-pin:v2\0${testPinPlain}`).digest('hex');
    const computedHash = `v2:${digest}`;

    // Ensure evaluator is active
    let evaluatorDoc = await db.collection('evaluators').findOne({ _id: assignmentForEval.evaluatorId });
    if (!evaluatorDoc) {
      evaluatorDoc = await db.collection('evaluators').findOne({ email: 'evaluator.test@company.com' });
      if (evaluatorDoc) {
        await db.collection('evaluationAssignments').updateOne(
          { _id: assignmentForEval._id },
          { $set: { evaluatorId: evaluatorDoc._id } }
        );
        assignmentForEval.evaluatorId = evaluatorDoc._id;
      } else {
        evaluatorDoc = {
          _id: assignmentForEval.evaluatorId,
          status: 'active',
          name: { th: 'ผู้ประเมินทดสอบ', en: 'Test Evaluator' },
          email: `evaluator.${Date.now()}@company.com`
        };
        await db.collection('evaluators').insertOne(evaluatorDoc);
      }
    }
    if (evaluatorDoc.status !== 'active') {
      await db.collection('evaluators').updateOne({ _id: evaluatorDoc._id }, { $set: { status: 'active' } });
    }

    // Update assignment to have matching accessPinHash and deadline in future
    await db.collection('evaluationAssignments').updateOne(
      { _id: assignmentForEval._id },
      {
        $set: {
          accessPinHash: computedHash,
          deadlineAt: new Date(Date.now() + 30 * 24 * 3600 * 1000),
          status: 'inProgress'
        }
      }
    );

    // Insert or update an invitation
    await db.collection('invitations').updateOne(
      { assignmentId: assignmentForEval._id.toString() },
      {
        $set: {
          assignmentId: assignmentForEval._id.toString(),
          evaluatorId: assignmentForEval.evaluatorId,
          email: 'evaluator.test@company.com',
          status: 'active',
          accessPinHash: computedHash,
          expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      },
      { upsert: true }
    );

    // Now test verify-pin with testPinPlain!
    const validPinRes = await post('/public/evaluations/verify-pin', '', { pin: testPinPlain });
    console.log('Valid PIN verify response status:', validPinRes.status);
    if (validPinRes.ok) {
      const pinData = await validPinRes.json();
      recordPass('evaluator', 'PIN Verification', `Successfully authenticated with 16-char PIN! assignmentId=${pinData.assignmentId}`);

      // Extract cookie
      const rawCookies = validPinRes.headers.getSetCookie ? validPinRes.headers.getSetCookie() : [validPinRes.headers.get('set-cookie')];
      const cookies = [];
      for (const raw of rawCookies) {
        const match = raw.match(/^(its_[a-z]+=[^;]+)/i);
        if (match) cookies.push(match[1]);
      }
      const evalCookie = cookies.join('; ');

      // Evaluator loads assignment questions
      const evalViewRes = await get(`/evaluations/${pinData.assignmentId}`, evalCookie);
      if (evalViewRes.ok) {
        const evalView = await evalViewRes.json();
        recordPass('evaluator', 'Form Load', `Evaluator loaded assignment form with ${evalView.assignment?.questionSnapshot?.length || 0} sections`);

        // Build dynamic answers matching the actual questionSnapshot
        const dynamicAnswers = {};
        for (const section of (evalView.assignment?.questionSnapshot || [])) {
          for (const q of (section.questions || [])) {
            if (q.type === 'rating') {
              dynamicAnswers[q.id] = q.scaleMax || 5;
            } else if (q.type === 'boolean') {
              dynamicAnswers[q.id] = true;
            } else if (q.type === 'text') {
              dynamicAnswers[q.id] = 'ผลการประเมินการฝึกงานดีเยี่ยม มีความรับผิดชอบสูง';
            }
          }
        }

        // Evaluator saves draft
        const draftRes = await fetch(`${API_BASE}/evaluations/${pinData.assignmentId}/draft`, {
          method: 'PUT',
          headers: {
            'Cookie': evalCookie,
            'x-requested-with': 'XMLHttpRequest',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            answers: dynamicAnswers,
            revision: evalView.draft?.revision || 0
          })
        });

        if (draftRes.ok) {
          recordPass('evaluator', 'Draft Save', 'Evaluator successfully saved draft answers');

          // Now test final submit!
          const submitIdempotencyKey = crypto.randomUUID();
          const submitRes = await fetch(`${API_BASE}/evaluations/${pinData.assignmentId}/submit`, {
            method: 'POST',
            headers: {
              'Cookie': evalCookie,
              'x-requested-with': 'XMLHttpRequest',
              'Content-Type': 'application/json',
              'idempotency-key': submitIdempotencyKey
            },
            body: JSON.stringify({
              answers: dynamicAnswers,
              revision: (evalView.draft?.revision || 0) + 1
            })
          });

          if (submitRes.ok) {
            recordPass('evaluator', 'Submit', 'Evaluator successfully submitted final evaluation!');
          } else {
            recordBug('evaluator', 'Submit', `Final submit returned ${submitRes.status}`, await submitRes.text());
          }
        } else {
          recordBug('evaluator', 'Draft Save', `Save draft returned ${draftRes.status}`, await draftRes.text());
        }
      } else {
        recordBug('evaluator', 'Form Load', `Evaluator GET /evaluations/${pinData.assignmentId} returned ${evalViewRes.status}`, await evalViewRes.text());
      }

    } else {
      recordBug('evaluator', 'PIN Verification', `Valid PIN rejected with ${validPinRes.status}`, await validPinRes.text());
    }
  }

  await client.close();

  console.log('\n================ FINAL RESULTS ================');
  console.log(`Passed Checks: ${Object.values(report.roles).flat().length}`);
  console.log(`Bugs Found: ${report.bugs.length}`);
  if (report.bugs.length > 0) {
    console.log('\nList of Bugs:');
    report.bugs.forEach((b, i) => {
      console.log(`${i + 1}. [${b.role}][${b.feature}] ${b.message}`);
    });
  }
}

run().catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
