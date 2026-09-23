import { describe, expect, it } from 'vitest'

import { createSandboxedEmailPreviewDocument } from '../app/utils/email-preview'

describe('email preview document isolation', () => {
  it('adds restrictive CSP before rendering user-controlled email HTML', () => {
    const document = createSandboxedEmailPreviewDocument(
      '<img src="https://example.test/tracker"><script>alert(1)</script>'
    )

    expect(document.indexOf('Content-Security-Policy')).toBeLessThan(
      document.indexOf('<body>')
    )
    expect(document).toContain("default-src 'none'")
    expect(document).toContain("connect-src 'none'")
    expect(document).toContain(
      '<img src="https://example.test/tracker"><script>alert(1)</script>'
    )
  })
})
