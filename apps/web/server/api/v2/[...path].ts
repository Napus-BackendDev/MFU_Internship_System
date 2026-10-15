import { useRuntimeConfig } from '#imports'
import { defineEventHandler, proxyRequest } from 'h3'

export default defineEventHandler((event) => {
  const config = useRuntimeConfig(event)
  const baseUrl = config.apiInternalBaseUrl.replace(/\/$/u, '')
  const requestPath = event.path.replace(/^\/api\/v2(?=\/|\?|$)/u, '')
  return proxyRequest(event, `${baseUrl}${requestPath}`)
})
