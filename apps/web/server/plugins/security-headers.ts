import { randomBytes } from 'node:crypto'

import { defineNitroPlugin } from '#imports'
import { configuredApiOrigin } from '../utils/security-headers'

function contentSecurityPolicy(
  nonce: string,
  apiBaseUrl?: string,
  isDevOverride?: boolean
): string {
  const isDev = Boolean(
    isDevOverride ??
      (process.env['NODE_ENV'] === 'development' ||
        process.env.NODE_ENV === 'development' ||
        process.env.NODE_ENV !== 'production')
  )
  const connectSources = ["'self'"]
  const rawApiUrl =
    apiBaseUrl ||
    process.env.NUXT_PUBLIC_API_BASE_URL ||
    (isDev ? 'http://localhost:8081/api/v2' : undefined)

  const apiOrigin = configuredApiOrigin(rawApiUrl, isDev)
  if (apiOrigin) {
    connectSources.push(apiOrigin)
    if (isDev) {
      if (apiOrigin.includes('localhost')) {
        connectSources.push(apiOrigin.replace('localhost', '127.0.0.1'))
      } else if (apiOrigin.includes('127.0.0.1')) {
        connectSources.push(apiOrigin.replace('127.0.0.1', 'localhost'))
      }
    }
  } else if (isDev) {
    connectSources.push('http://localhost:8081', 'http://127.0.0.1:8081')
  }

  if (isDev) {
    connectSources.push('ws:', 'wss:')
  }

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    `script-src 'self' 'nonce-${nonce}'`,
    // Vue and document-preview styles use inline style attributes; scripts remain nonce-only.
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: blob: https:",
    `connect-src ${connectSources.join(' ')}`,
    "frame-src 'self' data: blob:"
  ].join('; ')
}

function addScriptNonce(markup: string, nonce: string): string {
  return markup.replace(
    /<script(?=\s|>)(?![^>]*\snonce=)/g,
    `<script nonce="${nonce}"`
  )
}

export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('render:html', (html, { event }) => {
    const nonce = randomBytes(18).toString('base64')
    event.context.cspNonce = nonce

    let apiBaseUrl: string | undefined = process.env.NUXT_PUBLIC_API_BASE_URL
    let isDev: boolean | undefined = undefined

    try {
      const config = useRuntimeConfig(event)
      if (!apiBaseUrl && typeof config?.public?.apiBaseUrl === 'string') {
        apiBaseUrl = config.public.apiBaseUrl
      }
      if (config?.public?.appEnvironment === 'development') {
        isDev = true
      }
    } catch {
      // ignore
    }

    event.node.res.setHeader(
      'Content-Security-Policy',
      contentSecurityPolicy(nonce, apiBaseUrl, isDev)
    )
    event.node.res.setHeader('Cache-Control', 'private, no-store')

    for (const section of [
      html.head,
      html.body,
      html.bodyPrepend,
      html.bodyAppend
    ]) {
      for (let index = 0; index < section.length; index += 1) {
        section[index] = addScriptNonce(section[index]!, nonce)
      }
    }
  })

  nitro.hooks.hook('render:html:chunk', (context, { event }) => {
    const nonce = event.context.cspNonce
    if (typeof nonce !== 'string') return

    const htmlChunk = new TextDecoder().decode(context.chunk)
    context.chunk = new TextEncoder().encode(addScriptNonce(htmlChunk, nonce))
  })
})
