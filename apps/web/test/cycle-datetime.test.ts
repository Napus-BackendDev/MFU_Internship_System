import { describe, expect, it } from 'vitest'

import {
  bangkokDateTimeInputToIso,
  formatBangkokDateTimeInput
} from '../app/utils/cycle-datetime.js'

describe('evaluation cycle Bangkok date-time conversion', () => {
  it('converts a Bangkok wall time to the same instant regardless of host timezone', () => {
    expect(bangkokDateTimeInputToIso('2026-09-27T12:30')).toBe(
      '2026-09-27T05:30:00.000Z'
    )
  })

  it('formats an instant as a Bangkok wall time', () => {
    expect(
      formatBangkokDateTimeInput(new Date('2026-09-27T05:30:00.000Z'))
    ).toBe('2026-09-27T12:30')
  })

  it('rejects malformed and impossible local dates', () => {
    expect(bangkokDateTimeInputToIso('27/09/2026 12:30')).toBeUndefined()
    expect(bangkokDateTimeInputToIso('2026-02-30T12:30')).toBeUndefined()
  })
})
