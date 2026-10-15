import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { resolve } from 'node:path'
import { after, before, test } from 'node:test'

let backend
let web
const webUrl = 'http://127.0.0.1:18187'

before(async () => {
  backend = createServer(async (request, response) => {
    const chunks = []
    for await (const chunk of request) chunks.push(chunk)
    response.setHeader('content-type', 'application/json')
    response.setHeader('set-cookie', [
      'its_access=qa-access; HttpOnly; Path=/; SameSite=Lax',
      'its_refresh=qa-refresh; HttpOnly; Path=/api/v2/auth; SameSite=Lax'
    ])
    response.statusCode = request.url.startsWith('/api/v2/failure') ? 422 : 201
    response.end(
      JSON.stringify({
        path: request.url,
        method: request.method,
        cookie: request.headers.cookie,
        contentType: request.headers['content-type'],
        body: Buffer.concat(chunks).toString('base64')
      })
    )
  })
  backend.listen(0, '127.0.0.1')
  await once(backend, 'listening')
  const address = backend.address()
  web = spawn(process.execPath, ['.output/server/index.mjs'], {
    cwd: resolve('apps/web'),
    windowsHide: true,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      NITRO_HOST: '127.0.0.1',
      NITRO_PORT: '18187',
      NUXT_PUBLIC_APP_ENVIRONMENT: 'development',
      NUXT_API_INTERNAL_BASE_URL: `http://127.0.0.1:${address.port}/api/v2`
    },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  await new Promise((accept, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('Web proxy did not start')),
      15000
    )
    web.once('error', reject)
    web.once('exit', (code) => reject(new Error(`Web exited ${code}`)))
    web.stdout.on('data', (chunk) => {
      if (chunk.toString().includes('Listening on')) {
        clearTimeout(timeout)
        accept()
      }
    })
  })
})

after(async () => {
  if (web?.exitCode === null) {
    web.kill()
    await once(web, 'exit')
  }
  if (backend) await new Promise((accept) => backend.close(accept))
})

test('production-built proxy preserves GET path, query, cookies and multiple Set-Cookie headers', async () => {
  const response = await fetch(`${webUrl}/api/v2/example?page=2&search=QA`, {
    headers: { cookie: 'its_access=qa-request-cookie' }
  })
  assert.equal(response.status, 201)
  const body = await response.json()
  assert.equal(body.path, '/api/v2/example?page=2&search=QA')
  assert.equal(body.cookie, 'its_access=qa-request-cookie')
  assert.equal(response.headers.getSetCookie().length, 2)
  assert.match(response.headers.getSetCookie()[0], /HttpOnly/)
})

test('production-built proxy forwards JSON POST unchanged', async () => {
  const payload = JSON.stringify({ name: 'นักศึกษาทดสอบ' })
  const response = await fetch(`${webUrl}/api/v2/example`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: payload
  })
  const body = await response.json()
  assert.equal(body.method, 'POST')
  assert.equal(Buffer.from(body.body, 'base64').toString(), payload)
})

test('production-built proxy preserves multipart upload bytes and boundary', async () => {
  const payload = Buffer.from(
    '--qa-boundary\r\nContent-Disposition: form-data; name="file"; filename="qa.ttf"\r\nContent-Type: font/ttf\r\n\r\n\x00\x01\x02\r\n--qa-boundary--\r\n',
    'binary'
  )
  const response = await fetch(`${webUrl}/api/v2/document-assets`, {
    method: 'POST',
    headers: { 'content-type': 'multipart/form-data; boundary=qa-boundary' },
    body: payload
  })
  const body = await response.json()
  assert.equal(body.contentType, 'multipart/form-data; boundary=qa-boundary')
  assert.deepEqual(Buffer.from(body.body, 'base64'), payload)
})

test('production-built proxy preserves backend validation status and body', async () => {
  const response = await fetch(`${webUrl}/api/v2/failure`)
  assert.equal(response.status, 422)
  assert.equal((await response.json()).path, '/api/v2/failure')
})
