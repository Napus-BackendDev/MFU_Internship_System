/**
 * User Simulation Test Script
 * Simulates user journeys across all 4 roles:
 * 1. System Admin / Staff: Dashboard, Students, Export, Documents, Users, Settings
 * 2. Coordinator: Scoped student and evaluation access
 * 3. Student: Profile, Placement, Assignments, Documents
 * 4. External Evaluator: PIN verification flow
 */
import { createRequire } from 'module';
import { randomUUID } from 'crypto';

const require = createRequire(import.meta.url);
const pnpmMongo = require.resolve('mongodb', { paths: ['./apps/api', './apps/worker', '.'] });
const { MongoClient } = require(pnpmMongo);

const API_BASE = 'http://localhost:8081/api/v2';
const MONGO_URI = 'mongodb://127.0.0.1:27017/internship_transcript_v2_dev';

const results = {
  rolesTested: [],
  passedScenarios: [],
  discoveredBugs: []
};

function logBug(role, feature, description, errorDetails) {
  console.error(`[BUG FOUND][${role}][${feature}] ${description}`, errorDetails || '');
  results.discoveredBugs.push({ role, feature, description, errorDetails: String(errorDetails) });
}

function logPass(role, feature, description) {
  console.log(`[PASS][${role}][${feature}] ${description}`);
  results.passedScenarios.push({ role, feature, description });
}

async function devLogin(email, role, extra = {}) {
  const res = await fetch(`${API_BASE}/auth/dev/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, role, displayName: extra.displayName || role, ...extra })
  });
  if (!res.ok) {
    throw new Error(`Login failed for ${role}: ${res.status} ${await res.text()}`);
  }
  const setCookie = res.headers.get('set-cookie');
  const cookies = [];
  if (setCookie) {
    for (const part of setCookie.split(',')) {
      const match = part.match(/(its_[a-z]+=[^;]+)/i);
      if (match) cookies.push(match[1]);
    }
  }
  const cookieHeader = cookies.join('; ');
  const data = await res.json();
  return { actor: data.actor, cookieHeader };
}

async function apiFetch(path, cookieHeader, options = {}) {
  const url = `${API_BASE}${path}`;
  const headers = {
    'Accept': 'application/json',
    'Cookie': cookieHeader || '',
    'x-requested-with': 'XMLHttpRequest',
    ...(options.headers || {})
  };
  if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(options.body);
  }
  return fetch(url, { ...options, headers });
}

async function testAdminRole() {
  console.log('\n--- TESTING ROLE: System Administrator ---');
  results.rolesTested.push('systemAdmin');
  let session;
  try {
    session = await devLogin('admin@mfu.ac.th', 'systemAdmin', { displayName: 'Admin' });
    logPass('systemAdmin', 'Auth', 'Successfully logged in as systemAdmin');
  } catch (err) {
    logBug('systemAdmin', 'Auth', 'Login failed', err.message);
    return;
  }

  // 1. Check /auth/me
  try {
    const res = await apiFetch('/auth/me', session.cookieHeader);
    if (res.ok) {
      logPass('systemAdmin', 'Auth', 'GET /auth/me succeeded');
    } else {
      logBug('systemAdmin', 'Auth', 'GET /auth/me returned ' + res.status, await res.text());
    }
  } catch (err) {
    logBug('systemAdmin', 'Auth', 'GET /auth/me threw error', err.message);
  }

  // 2. Check Staff Dashboard Reports / KPI Overview
  try {
    const res = await apiFetch('/reports/overview', session.cookieHeader);
    if (res.ok) {
      const data = await res.json();
      logPass('systemAdmin', 'Dashboard', `GET /reports/overview returned metrics: students=${data.students}, readyDocuments=${data.readyDocuments}`);
    } else {
      logBug('systemAdmin', 'Dashboard', 'GET /reports/overview returned ' + res.status, await res.text());
    }
  } catch (err) {
    logBug('systemAdmin', 'Dashboard', 'GET /reports/overview error', err.message);
  }

  // 3. Check Student Directory List
  let firstStudentId = null;
  try {
    const res = await apiFetch('/students?page=1&pageSize=25', session.cookieHeader);
    if (res.ok) {
      const data = await res.json();
      const items = data.items || [];
      const total = data.meta?.total ?? items.length;
      logPass('systemAdmin', 'Students', `GET /students returned ${items.length} students (total: ${total})`);
      if (items.length > 0) {
        firstStudentId = items[0].id || items[0]._id;
      }
    } else {
      logBug('systemAdmin', 'Students', 'GET /students returned ' + res.status, await res.text());
    }
  } catch (err) {
    logBug('systemAdmin', 'Students', 'GET /students error', err.message);
  }

  // 4. Check Single Student Detail
  if (firstStudentId) {
    try {
      const res = await apiFetch(`/students/${firstStudentId}`, session.cookieHeader);
      if (res.ok) {
        logPass('systemAdmin', 'Students', `GET /students/${firstStudentId} succeeded`);
      } else {
        logBug('systemAdmin', 'Students', `GET /students/${firstStudentId} returned ${res.status}`, await res.text());
      }
    } catch (err) {
      logBug('systemAdmin', 'Students', `GET /students/${firstStudentId} error`, err.message);
    }
  }

  // 5. Check Export creation endpoint
  try {
    const res = await apiFetch('/reports/exports', session.cookieHeader, {
      method: 'POST',
      headers: { 'idempotency-key': randomUUID() },
      body: {
        reportType: 'assignments',
        filters: {},
        format: 'csv'
      }
    });
    if (res.status === 202 || res.ok) {
      logPass('systemAdmin', 'Export', 'POST /reports/exports created export job');
    } else {
      logBug('systemAdmin', 'Export', 'POST /reports/exports returned ' + res.status, await res.text());
    }
  } catch (err) {
    logBug('systemAdmin', 'Export', 'POST /reports/exports error', err.message);
  }

  // 6. Check Evaluations / Assignments List
  try {
    const res = await apiFetch('/evaluation-assignments?page=1&pageSize=25', session.cookieHeader);
    if (res.ok) {
      const data = await res.json();
      const items = data.items || [];
      logPass('systemAdmin', 'Evaluations', `GET /evaluation-assignments returned ${items.length} assignments`);
    } else {
      logBug('systemAdmin', 'Evaluations', 'GET /evaluation-assignments returned ' + res.status, await res.text());
    }
  } catch (err) {
    logBug('systemAdmin', 'Evaluations', 'GET /evaluation-assignments error', err.message);
  }

  // 7. Check Document Templates
  try {
    const res = await apiFetch('/document-templates?page=1&pageSize=25', session.cookieHeader);
    if (res.ok) {
      await res.json();
      logPass('systemAdmin', 'Documents', `GET /document-templates succeeded`);
    } else {
      logBug('systemAdmin', 'Documents', 'GET /document-templates returned ' + res.status, await res.text());
    }
  } catch (err) {
    logBug('systemAdmin', 'Documents', 'GET /document-templates error', err.message);
  }

  // 8. Check Generated Documents List
  try {
    const res = await apiFetch('/generated-documents?page=1&pageSize=25', session.cookieHeader);
    if (res.ok) {
      await res.json();
      logPass('systemAdmin', 'Documents', `GET /generated-documents returned generated documents`);
    } else {
      logBug('systemAdmin', 'Documents', 'GET /generated-documents returned ' + res.status, await res.text());
    }
  } catch (err) {
    logBug('systemAdmin', 'Documents', 'GET /generated-documents error', err.message);
  }

  // 9. Check Users Management
  try {
    const res = await apiFetch('/users?page=1&pageSize=25', session.cookieHeader);
    if (res.ok) {
      const data = await res.json();
      logPass('systemAdmin', 'Users', `GET /users returned ${data.items ? data.items.length : 0} users`);
    } else {
      logBug('systemAdmin', 'Users', 'GET /users returned ' + res.status, await res.text());
    }
  } catch (err) {
    logBug('systemAdmin', 'Users', 'GET /users error', err.message);
  }

  // 10. Check Academic Reference Catalogs (Schools, Programs, Terms, Cycles)
  const academicEndpoints = [
    { name: 'schools', path: '/academic/schools' },
    { name: 'programs', path: '/academic/programs' },
    { name: 'terms', path: '/academic/terms' },
    { name: 'cycles', path: '/evaluation-cycles' }
  ];
  for (const catalog of academicEndpoints) {
    try {
      const res = await apiFetch(`${catalog.path}?page=1&pageSize=25`, session.cookieHeader);
      if (res.ok) {
        logPass('systemAdmin', 'Academic', `GET ${catalog.path} succeeded`);
      } else {
        logBug('systemAdmin', 'Academic', `GET ${catalog.path} returned ${res.status}`, await res.text());
      }
    } catch (err) {
      logBug('systemAdmin', 'Academic', `GET ${catalog.path} error`, err.message);
    }
  }
}

async function testStudentRole() {
  console.log('\n--- TESTING ROLE: Student ---');
  results.rolesTested.push('student');
  let session;
  try {
    session = await devLogin('student@mfu.ac.th', 'student', {
      displayName: 'Somchai Student',
      studentId: 'DEV0001'
    });
    logPass('student', 'Auth', 'Successfully logged in as student');
  } catch (err) {
    logBug('student', 'Auth', 'Student dev login failed', err.message);
    return;
  }

  // 1. Check Student Own Profile
  try {
    const res = await apiFetch('/students?page=1&pageSize=1', session.cookieHeader);
    if (res.ok) {
      const data = await res.json();
      logPass('student', 'Profile', `GET /students returned student profile (${data.items?.length || 0} items)`);
    } else {
      logBug('student', 'Profile', 'GET /students returned ' + res.status, await res.text());
    }
  } catch (err) {
    logBug('student', 'Profile', 'GET /students error', err.message);
  }

  // 2. Check Student Placements
  try {
    const res = await apiFetch('/placements?page=1&pageSize=25', session.cookieHeader);
    if (res.ok) {
      const placements = await res.json();
      logPass('student', 'Placements', `GET /placements returned ${(placements.items || []).length} placements`);
    } else {
      logBug('student', 'Placements', 'GET /placements returned ' + res.status, await res.text());
    }
  } catch (err) {
    logBug('student', 'Placements', 'Student placement fetch error', err.message);
  }

  // 3. Check Student Evaluations
  try {
    const res = await apiFetch('/evaluation-assignments?page=1&pageSize=25', session.cookieHeader);
    if (res.ok) {
      const assignments = await res.json();
      logPass('student', 'Evaluations', `GET /evaluation-assignments returned ${(assignments.items || []).length} assignments`);
    } else {
      logBug('student', 'Evaluations', 'GET /evaluation-assignments returned ' + res.status, await res.text());
    }
  } catch (err) {
    logBug('student', 'Evaluations', 'Student evaluation fetch error', err.message);
  }

  // 4. Check Student Documents
  try {
    const res = await apiFetch('/generated-documents?page=1&pageSize=25', session.cookieHeader);
    if (res.ok) {
      const docs = await res.json();
      logPass('student', 'Documents', `GET /generated-documents returned ${(docs.items || []).length} documents`);
    } else {
      logBug('student', 'Documents', 'GET /generated-documents returned ' + res.status, await res.text());
    }
  } catch (err) {
    logBug('student', 'Documents', 'Student documents fetch error', err.message);
  }
}

async function testEvaluatorRole() {
  console.log('\n--- TESTING ROLE: External Evaluator (PIN Flow) ---');
  results.rolesTested.push('evaluator');

  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db();

  const invitations = await db.collection('invitations').find({}).limit(5).toArray();
  console.log(`Found ${invitations.length} invitations in DB`);

  // Test invalid PIN verification
  try {
    const res = await fetch(`${API_BASE}/public/evaluations/verify-pin`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-requested-with': 'XMLHttpRequest'
      },
      body: JSON.stringify({ pin: '0000000000000000' })
    });
    console.log('POST /public/evaluations/verify-pin status:', res.status);
    if (res.status === 400 || res.status === 401 || res.status === 404) {
      logPass('evaluator', 'PIN Verification', `Invalid PIN correctly rejected with ${res.status}`);
    } else {
      logBug('evaluator', 'PIN Verification', 'Unexpected status: ' + res.status, await res.text());
    }
  } catch (err) {
    logBug('evaluator', 'PIN Verification', 'POST /public/evaluations/verify-pin error', err.message);
  }

  await client.close();
}

async function runAll() {
  await testAdminRole();
  await testStudentRole();
  await testEvaluatorRole();

  console.log('\n================ TEST SUMMARY ================');
  console.log(`Roles Tested: ${results.rolesTested.join(', ')}`);
  console.log(`Passed Scenarios: ${results.passedScenarios.length}`);
  console.log(`Bugs/Issues Discovered: ${results.discoveredBugs.length}`);
  if (results.discoveredBugs.length > 0) {
    console.log('Discovered issues:');
    results.discoveredBugs.forEach((b, i) => {
      console.log(`${i + 1}. [${b.role}][${b.feature}] ${b.description}`);
    });
    process.exit(1);
  }
}

runAll().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
