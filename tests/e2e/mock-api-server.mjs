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
const studentReferenceQueries = []
const evaluationDirectoryQueries = []
const e2eOrganizationId = '64f000000000000000000020'
const e2eEvaluatorId = '64f000000000000000000021'
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
  if (
    request.method === 'POST' &&
    path === '/__test/reset-student-reference-queries'
  ) {
    studentReferenceQueries.length = 0
    response.writeHead(204).end()
    return
  }
  if (
    request.method === 'GET' &&
    path === '/__test/student-reference-queries'
  ) {
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify(studentReferenceQueries))
    return
  }
  if (
    request.method === 'POST' &&
    path === '/__test/reset-evaluation-directory-queries'
  ) {
    evaluationDirectoryQueries.length = 0
    response.writeHead(204).end()
    return
  }
  if (
    request.method === 'GET' &&
    path === '/__test/evaluation-directory-queries'
  ) {
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify(evaluationDirectoryQueries))
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
    if (
      [
        '/api/v2/students',
        '/api/v2/evaluators',
        '/api/v2/organizations',
        '/api/v2/evaluation-assignments'
      ].includes(path)
    ) {
      evaluationDirectoryQueries.push({
        path: path.replace('/api/v2', ''),
        query: Object.fromEntries(requestUrl.searchParams.entries())
      })
    }
    if (
      [
        '/api/v2/academic/terms',
        '/api/v2/academic/schools',
        '/api/v2/academic/programs',
        '/api/v2/academic/courses',
        '/api/v2/evaluation-cycles',
        '/api/v2/competency-sets'
      ].includes(path)
    ) {
      studentReferenceQueries.push({
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
    const studentItems = [
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
          school: {
            id: 'school-e2e',
            schoolCode: 'SCI',
            name: { th: 'สำนักวิชาวิทยาศาสตร์', en: 'Science' }
          },
          program: {
            id: 'program-e2e',
            programCode: 'SE',
            name: { th: 'วิศวกรรมซอฟต์แวร์', en: 'Software Engineering' }
          },
          term: { id: 'term-e2e', semester: '1', academicYear: 2026 },
          placements: [
            {
              id: 'placement-e2e',
              studentId: 'student-record-e2e',
              organizationId: e2eOrganizationId,
              academicTermId: 'term-e2e',
              academicTerm: {
                id: 'term-e2e',
                semester: '1',
                academicYear: 2026
              },
              status: 'active',
              organization: {
                id: e2eOrganizationId,
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
    ]
    const requestedStudentIds = requestUrl.searchParams
      .get('studentIds')
      ?.split(',')
    payload = queryPage(
      requestedStudentIds?.length
        ? studentItems.filter(
            (student) =>
              requestedStudentIds.includes(student.id) ||
              requestedStudentIds.includes(student.studentId)
          )
        : studentItems,
      request.url
    )
  } else if (request.method === 'GET' && path === '/api/v2/evaluators') {
    const evaluatorItems = [
      {
        id: e2eEvaluatorId,
        organizationId: e2eOrganizationId,
        name: { th: 'ผู้ประเมินทดสอบ', en: 'Test Evaluator' },
        email: 'evaluator@example.test',
        position: { th: 'หัวหน้างาน', en: 'Supervisor' }
      }
    ]
    const requestedEvaluatorIds = requestUrl.searchParams
      .get('evaluatorIds')
      ?.split(',')
    payload = queryPage(
      requestedEvaluatorIds?.length
        ? evaluatorItems.filter((item) =>
            requestedEvaluatorIds.includes(item.id)
          )
        : evaluatorItems,
      request.url
    )
  } else if (request.method === 'GET' && path === '/api/v2/organizations') {
    const organizationItems = [
      {
        id: e2eOrganizationId,
        organizationCode: 'TEST',
        name: { th: 'บริษัททดสอบ', en: 'Test Company' }
      }
    ]
    const requestedOrganizationIds = requestUrl.searchParams
      .get('organizationIds')
      ?.split(',')
    payload = queryPage(
      requestedOrganizationIds?.length
        ? organizationItems.filter((item) =>
            requestedOrganizationIds.includes(item.id)
          )
        : organizationItems,
      request.url
    )
  } else if (
    request.method === 'GET' &&
    path === '/api/v2/evaluation-assignments'
  ) {
    const assignmentItems = [
      {
        id: 'assignment-e2e',
        studentId: 'student-record-e2e',
        cycleId: 'cycle-e2e',
        evaluatorId: e2eEvaluatorId,
        deadlineAt: '2026-12-31T23:59:59.000Z',
        status: 'pending'
      }
    ]
    const organizationId = requestUrl.searchParams.get('organizationId')
    const status = requestUrl.searchParams.get('status')
    const search = requestUrl.searchParams.get('search')?.toLocaleLowerCase()
    const filteredAssignments = assignmentItems.filter((item) => {
      if (organizationId && organizationId !== e2eOrganizationId) return false
      if (status && status !== item.status) return false
      if (!search) return true
      return [
        '6631503001',
        'นักศึกษาทดสอบ',
        'example student',
        'student@example.test',
        'ผู้ประเมินทดสอบ',
        'test evaluator',
        'evaluator@example.test',
        'test company',
        'test'
      ].some((value) => value.toLocaleLowerCase().includes(search))
    })
    payload = queryPage(filteredAssignments, request.url)
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
        organizationId: e2eOrganizationId,
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
