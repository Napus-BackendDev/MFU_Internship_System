import { describe, expect, it } from 'vitest'

import { resolveSafeDownloadUrl } from '../app/utils/safe-download-url.js'

describe('resolveSafeDownloadUrl', () => {
  it('allows an HTTPS signed object-storage URL from an HTTPS page', () => {
    expect(
      resolveSafeDownloadUrl(
        'https://storage.example.test/report.xlsx?signature=opaque',
        'https:'
      )
    ).toBe('https://storage.example.test/report.xlsx?signature=opaque')
  })

  it('rejects active schemes and malformed URLs', () => {
    for (const url of [
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      '//storage.example.test/report.xlsx',
      'not a URL'
    ]) {
      expect(resolveSafeDownloadUrl(url, 'https:'), url).toBeNull()
    }
  })

  it('rejects insecure HTTP downloads from HTTPS pages', () => {
    expect(
      resolveSafeDownloadUrl(
        'http://storage.example.test/report.xlsx',
        'https:'
      )
    ).toBeNull()
  })

  it('allows HTTP only for an HTTP development page', () => {
    expect(
      resolveSafeDownloadUrl('http://localhost:9000/report.xlsx', 'http:')
    ).toBe('http://localhost:9000/report.xlsx')
  })

  it('rejects URLs containing credentials', () => {
    expect(
      resolveSafeDownloadUrl(
        'https://user:password@storage.example.test/report.xlsx',
        'https:'
      )
    ).toBeNull()
  })
})
