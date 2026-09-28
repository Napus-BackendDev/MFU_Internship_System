import { createServer } from 'node:http'

const actor = {
  id: 'cycle-manager-e2e',
  email: 'staff@example.test',
  displayName: 'Cycle manager',
  roles: ['systemAdmin'],
  scope: { tenant: true, schoolIds: [], programIds: [] }
}
const staffActor = {
  id: 'internship-staff-e2e',
  email: 'staff@example.test',
  displayName: 'Internship Staff',
  roles: ['internshipStaff'],
  scope: { tenant: true, schoolIds: [], programIds: [] }
}
const coordinatorActor = {
  id: 'coordinator-e2e',
  email: 'coordinator@example.test',
  displayName: 'Coordinator',
  roles: ['coordinator'],
  scope: { tenant: false, schoolIds: ['school-e2e'], programIds: [] }
}
const failNextApiPaths = new Map()
const injectedFailureCounts = new Map()
const apiRequestCounts = new Map()
const cycleReferenceQueries = []
const corsHeaders = {
  'access-control-allow-origin': 'http://127.0.0.1:18080',
  'access-control-allow-credentials': 'true',
  'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'access-control-allow-headers':
    'accept, authorization, content-type, x-requested-with, x-request-id, x-csrf-token',
  vary: 'Origin'
}

function actorForRequest(request) {
  if (request.headers.cookie?.includes('e2e-actor=staff')) return staffActor
  if (request.headers.cookie?.includes('e2e-actor=coordinator')) {
    return coordinatorActor
  }
  return actor
}

const page = (items) => ({
  items,
  meta: {
    total: items.length,
    page: 1,
    pageSize: 500,
    totalPages: items.length > 0 ? 1 : 0
  }
})

function queryPage(items, requestUrl) {
  const url = new URL(requestUrl ?? '/', 'http://localhost')
  const requestedPage = Number(url.searchParams.get('page') ?? 1)
  const requestedPageSize = Number(url.searchParams.get('pageSize') ?? 25)
  const start = (requestedPage - 1) * requestedPageSize
  return {
    items: items.slice(start, start + requestedPageSize),
    meta: {
      total: items.length,
      page: requestedPage,
      pageSize: requestedPageSize,
      totalPages: Math.ceil(items.length / requestedPageSize)
    }
  }
}

const server = createServer((request, response) => {
  const requestUrl = new URL(request.url ?? '/', 'http://localhost')
  const path = requestUrl.pathname
  const currentActor = actorForRequest(request)
  const canManageDocumentTemplates =
    currentActor.roles.includes('systemAdmin') ||
    (currentActor.roles.includes('internshipStaff') &&
      currentActor.scope.tenant)
  let payload

  if (request.method === 'OPTIONS') {
    response.writeHead(204, corsHeaders).end()
    return
  }
  if (path === '/healthz') {
    response.writeHead(200).end('ok')
    return
  }
  if (
    request.method === 'POST' &&
    path === '/__test/reset-cycle-reference-queries'
  ) {
    cycleReferenceQueries.length = 0
    response.writeHead(204).end()
    return
  }
  if (request.method === 'GET' && path === '/__test/cycle-reference-queries') {
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify(cycleReferenceQueries))
    return
  }
  if (request.method === 'POST' && path === '/__test/fail-next') {
    const target = new URL(
      request.url ?? '/',
      'http://localhost'
    ).searchParams.get('path')
    if (
      target !== '/api/v2/students' &&
      target !== '/api/v2/academic/schools'
    ) {
      response.writeHead(400).end()
      return
    }
    const times = Number(
      new URL(request.url ?? '/', 'http://localhost').searchParams.get(
        'times'
      ) ?? 1
    )
    if (!Number.isInteger(times) || times < 1 || times > 3) {
      response.writeHead(400).end()
      return
    }
    failNextApiPaths.set(target, times)
    injectedFailureCounts.set(target, 0)
    apiRequestCounts.set(target, 0)
    response.writeHead(204).end()
    return
  }
  if (request.method === 'GET' && path === '/__test/failure-count') {
    const target = new URL(
      request.url ?? '/',
      'http://localhost'
    ).searchParams.get('path')
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(
      JSON.stringify({
        count: injectedFailureCounts.get(target) ?? 0,
        requests: apiRequestCounts.get(target) ?? 0
      })
    )
    return
  }
  if (request.method === 'GET' && path.startsWith('/api/v2/')) {
    apiRequestCounts.set(path, (apiRequestCounts.get(path) ?? 0) + 1)
    if (
      [
        '/api/v2/academic/terms',
        '/api/v2/academic/schools',
        '/api/v2/competency-sets'
      ].includes(path)
    ) {
      cycleReferenceQueries.push({
        path: path.replace('/api/v2', ''),
        query: Object.fromEntries(requestUrl.searchParams.entries())
      })
    }
  }
  const failuresRemaining = failNextApiPaths.get(path) ?? 0
  if (request.method === 'GET' && failuresRemaining > 0) {
    if (failuresRemaining === 1) failNextApiPaths.delete(path)
    else failNextApiPaths.set(path, failuresRemaining - 1)
    injectedFailureCounts.set(path, (injectedFailureCounts.get(path) ?? 0) + 1)
    response.writeHead(503, {
      ...corsHeaders,
      'content-type': 'application/json'
    })
    response.end(JSON.stringify({ error: { code: 'TEST_UPSTREAM_FAILURE' } }))
    return
  }
  if (request.method === 'GET' && path === '/api/v2/auth/me') {
    payload = { actor: currentActor }
  } else if (request.method === 'GET' && path === '/api/v2/evaluation-cycles') {
    const requestUrl = new URL(request.url ?? '/', 'http://localhost')
    const requestedPage = Number(requestUrl.searchParams.get('page') ?? 1)
    const requestedPageSize = Number(
      requestUrl.searchParams.get('pageSize') ?? 500
    )
    payload = {
      items: [],
      meta: {
        total: 0,
        page: requestedPage,
        pageSize: requestedPageSize,
        totalPages: 0
      }
    }
  } else if (
    request.method === 'GET' &&
    path === '/api/v2/document-templates'
  ) {
    payload = page([
      {
        id: 'document-template-e2e',
        code: 'E2E-TRANSCRIPT',
        name: 'แบบบันทึกผลการฝึกงานทดสอบ',
        documentType: 'transcript',
        status: 'active',
        createdAt: '2026-09-01T00:00:00.000Z',
        latestVersion: {
          id: 'document-template-version-e2e',
          versionNumber: 1,
          status: canManageDocumentTemplates ? 'draft' : 'published',
          schemaVersion: 2,
          revision: 1,
          editorMetadata: {
            nameTh: 'แบบบันทึกผลการฝึกงานทดสอบ',
            nameEn: 'E2E Internship Transcript',
            description: 'Playwright test fixture',
            backgroundType: 'none',
            bgOpacity: 10
          },
          ...(canManageDocumentTemplates ? { fontAssetKeys: [] } : {})
        }
      }
    ])
  } else if (
    request.method === 'GET' &&
    path === '/api/v2/document-template-versions/document-template-version-e2e'
  ) {
    if (!canManageDocumentTemplates) {
      response.writeHead(404, {
        ...corsHeaders,
        'content-type': 'application/json'
      })
      response.end(JSON.stringify({ error: { code: 'RESOURCE_NOT_FOUND' } }))
      return
    }
    payload = {
      id: 'document-template-version-e2e',
      templateId: 'document-template-e2e',
      versionNumber: 1,
      status: 'draft',
      schemaVersion: 2,
      revision: 1,
      editorMetadata: {
        nameTh: 'แบบบันทึกผลการฝึกงานทดสอบ',
        nameEn: 'E2E Internship Transcript',
        description: 'Playwright test fixture',
        backgroundType: 'none',
        bgOpacity: 10
      },
      fontAssetKeys: [],
      placeholders: [],
      canonicalJson: {
        width: 794,
        height: 1123,
        editorMetadata: {
          nameTh: 'แบบบันทึกผลการฝึกงานทดสอบ',
          nameEn: 'E2E Internship Transcript',
          description: 'Playwright test fixture',
          backgroundType: 'none',
          bgOpacity: 10
        },
        elements: [
          {
            id: 'title-e2e',
            type: 'heading',
            content: 'Internship Transcript',
            x: 24,
            y: 32,
            width: 746,
            height: 48,
            fontSize: 28,
            fontWeight: 'bold',
            color: '#1f2633',
            textAlign: 'center'
          }
        ]
      }
    }
  } else if (request.method === 'GET' && path === '/api/v2/document-assets') {
    payload = page([])
  } else if (
    request.method === 'POST' &&
    path ===
      '/api/v2/document-template-versions/document-template-version-e2e/publish'
  ) {
    payload = {
      id: 'document-template-version-e2e',
      templateId: 'document-template-e2e',
      versionNumber: 1,
      status: 'published',
      schemaVersion: 2,
      revision: 2,
      editorMetadata: {
        nameTh: 'แบบบันทึกผลการฝึกงานทดสอบ',
        nameEn: 'E2E Internship Transcript',
        description: 'Playwright test fixture',
        backgroundType: 'none',
        bgOpacity: 10
      },
      fontAssetKeys: [],
      placeholders: [],
      canonicalJson: {
        width: 794,
        height: 1123,
        elements: []
      }
    }
  } else if (request.method === 'GET' && path === '/api/v2/students') {
    payload = page([
      {
        id: 'student-record-e2e',
        studentId: '6631503001',
        name: { th: 'นักศึกษาทดสอบ', en: 'Example Student' },
        email: 'student@example.test',
        schoolId: 'school-e2e',
        programId: 'program-e2e',
        academicTermId: 'term-e2e',
        semester: '1',
        academicYear: 2026,
        directoryRelations: {
          placements: [
            {
              id: 'placement-e2e',
              studentId: 'student-record-e2e',
              organizationId: 'organization-e2e',
              academicTermId: 'term-e2e',
              status: 'active',
              organization: {
                id: 'organization-e2e',
                organizationCode: 'TEST',
                name: { th: 'บริษัททดสอบ', en: 'Test Company' },
                address: {
                  province: 'เชียงราย',
                  location: 'มหาวิทยาลัยแม่ฟ้าหลวง'
                }
              }
            }
          ]
        },
        status: 'active'
      }
    ])
  } else if (request.method === 'GET' && path === '/api/v2/evaluators') {
    payload = page([
      {
        id: 'evaluator-e2e',
        organizationId: 'organization-e2e',
        name: { th: 'ผู้ประเมินทดสอบ', en: 'Test Evaluator' },
        email: 'evaluator@example.test',
        position: { th: 'หัวหน้างาน', en: 'Supervisor' }
      }
    ])
  } else if (request.method === 'GET' && path === '/api/v2/organizations') {
    payload = page([
      {
        id: 'organization-e2e',
        organizationCode: 'TEST',
        name: { th: 'บริษัททดสอบ', en: 'Test Company' }
      }
    ])
  } else if (
    request.method === 'GET' &&
    path === '/api/v2/evaluation-assignments'
  ) {
    payload = page([
      {
        id: 'assignment-e2e',
        studentId: 'student-record-e2e',
        cycleId: 'cycle-e2e',
        evaluatorId: 'evaluator-e2e',
        deadlineAt: '2026-12-31T23:59:59.000Z',
        status: 'pending'
      }
    ])
  } else if (request.method === 'GET' && path === '/api/v2/academic/terms') {
    payload = queryPage(
      [
        {
          id: 'term-e2e',
          code: '2026/1',
          academicYear: 2026,
          semester: '1',
          status: 'open'
        }
      ],
      request.url
    )
  } else if (request.method === 'GET' && path === '/api/v2/academic/schools') {
    payload = queryPage(
      [
        {
          id: 'school-e2e',
          schoolCode: 'SCI',
          name: { th: 'สำนักวิชาวิทยาศาสตร์', en: 'Science' }
        }
      ],
      request.url
    )
  } else if (request.method === 'GET' && path === '/api/v2/academic/courses') {
    payload = page([])
  } else if (request.method === 'GET' && path === '/api/v2/academic/programs') {
    payload = page([
      {
        id: 'program-e2e',
        schoolId: 'school-e2e',
        programCode: 'SE',
        name: { th: 'วิศวกรรมซอฟต์แวร์', en: 'Software Engineering' }
      }
    ])
  } else if (
    request.method === 'GET' &&
    path === '/api/v2/system-settings/provinces'
  ) {
    payload = {
      items: [],
      total: 0,
      stats: { total: 0, active: 0, inactive: 0 }
    }
  } else if (request.method === 'GET' && path === '/api/v2/placements') {
    payload = page([
      {
        id: 'placement-e2e',
        studentId: 'student-record-e2e',
        organizationId: 'organization-e2e',
        academicTermId: 'term-e2e',
        status: 'active'
      }
    ])
  } else if (request.method === 'GET' && path === '/api/v2/competency-sets') {
    payload = queryPage(
      [
        {
          id: 'competency-set-e2e',
          code: 'MFU-INTERNSHIP',
          name: { th: 'แบบประเมินฝึกงาน', en: 'Internship evaluation' }
        }
      ],
      request.url
    )
  } else {
    response.writeHead(404, {
      ...corsHeaders,
      'content-type': 'application/json'
    })
    response.end(JSON.stringify({ error: { code: 'MOCK_ROUTE_NOT_FOUND' } }))
    return
  }

  response.writeHead(200, {
    ...corsHeaders,
    'content-type': 'application/json'
  })
  response.end(JSON.stringify(payload))
})

server.listen(18081, '127.0.0.1')
