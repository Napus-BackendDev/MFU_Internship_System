import { describe, expect, it } from 'vitest'

import { sanitizeEmailHtml, sanitizeEmailTemplateHtml } from '../src/index.js'

describe('email HTML security policy', () => {
  it('removes active content, unsafe links, event handlers, and remote styles', () => {
    const sanitized = sanitizeEmailHtml(
      '<script>alert(1)</script><img src="https://evil.test/pixel" onerror="alert(1)"><a href="javascript:alert(1)" onclick="alert(1)">open</a><p style="background-image:url(https://evil.test/x);color:#123">safe</p>'
    )

    expect(sanitized).not.toContain('<script')
    expect(sanitized).not.toContain('<img')
    expect(sanitized).not.toContain('javascript:')
    expect(sanitized).not.toContain('onclick')
    expect(sanitized).not.toContain('background-image')
    expect(sanitized).toContain('<a>open</a>')
    expect(sanitized).toContain('color:#123')
  })

  it('keeps approved email layout and placeholders including the invitation link', () => {
    const sanitized = sanitizeEmailTemplateHtml(
      '<div style="font-family: Sarabun, sans-serif; max-width: 600px; padding: 16px; color: #123"><p>เรียน {{evaluator_name}}: {{student_name}}</p><a href="{{invitation_url}}">แบบประเมิน</a></div>'
    )

    expect(sanitized).toContain('font-family:Sarabun, sans-serif')
    expect(sanitized).toContain('max-width:600px')
    expect(sanitized).toContain('{{evaluator_name}}')
    expect(sanitized).toContain('{{student_name}}')
    expect(sanitized).toContain('href="{{invitation_url}}"')
  })

  it('drops non-approved placeholders from unsafe attributes without breaking the link', () => {
    const sanitized = sanitizeEmailTemplateHtml(
      '<a href="{{student_name}}">name</a><a href="//evil.test">external</a><a href="https://mfu.ac.th">MFU</a>'
    )

    expect(sanitized).toContain('<a>name</a>')
    expect(sanitized).not.toContain('//evil.test')
    expect(sanitized).toContain('href="https://mfu.ac.th"')
  })
})
