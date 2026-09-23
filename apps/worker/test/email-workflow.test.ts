import { describe, expect, it } from 'vitest'

import {
  deliveryFailureStatus,
  deliverySourcesAreCurrent,
  shouldRotateInvitationPin
} from '../src/runtime/email.processor.js'
import { renderSafeEmailHtml } from '../src/runtime/email-template.js'

const source = {
  invitationStatus: 'active',
  invitationAssignmentId: 'assignment-a',
  invitationExpiresAt: new Date('2026-10-01T00:00:00Z'),
  templatePublished: true,
  assignmentStatus: 'pending',
  assignmentDeadlineAt: new Date('2026-10-01T00:00:00Z')
}

describe('email delivery workflow guards', () => {
  it('refuses delivery for a submitted or mismatched assignment', () => {
    const now = new Date('2026-09-23T00:00:00Z')
    expect(deliverySourcesAreCurrent(source, 'assignment-a', now)).toBe(true)
    expect(
      deliverySourcesAreCurrent(
        { ...source, assignmentStatus: 'submitted' },
        'assignment-a',
        now
      )
    ).toBe(false)
    expect(deliverySourcesAreCurrent(source, 'assignment-b', now)).toBe(false)
  })

  it('does not rotate invitation PINs for reminders', () => {
    expect(shouldRotateInvitationPin('invitation')).toBe(true)
    expect(shouldRotateInvitationPin('reminder')).toBe(false)
  })

  it('marks transport timeouts uncertain but explicit SMTP rejection failed', () => {
    expect(deliveryFailureStatus(new Error('ETIMEDOUT'), true, false)).toBe(
      'uncertain'
    )
    expect(
      deliveryFailureStatus(
        Object.assign(new Error('Rejected'), { responseCode: 550 }),
        true,
        false
      )
    ).toBe('failed')
    expect(
      deliveryFailureStatus(new Error('SMTP_CONFIG_INVALID'), false, false)
    ).toBe('failed')
    expect(
      deliveryFailureStatus(new Error('DB_WRITE_FAILED'), true, true)
    ).toBe('uncertain')
  })

  it('escapes recipient data and sanitizes unsafe template HTML before delivery', () => {
    const html = renderSafeEmailHtml(
      '<script>alert(1)</script><p onclick="alert(1)">{{student_name}}</p><a href="{{invitation_url}}">Open</a><a href="javascript:alert(1)">bad</a>',
      {
        student_name: '<img src=x onerror=alert(1)>',
        invitation_url: 'https://internship.mfu.ac.th/evaluate?token=a&next=b'
      }
    )

    expect(html).not.toContain('<script')
    expect(html).not.toContain('<img')
    expect(html).not.toContain('onclick')
    expect(html).not.toContain('javascript:')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
    expect(html).toContain(
      'href="https://internship.mfu.ac.th/evaluate?token=a&amp;next=b"'
    )
  })
})
