import { describe, expect, it } from 'vitest'

import {
  buildEvaluationPinPath,
  readEvaluationEntryCredentials
} from '../app/utils/evaluation-entry-link'

describe('evaluation entry links', () => {
  it('places PIN credentials in the URL fragment', () => {
    const url = new URL(
      buildEvaluationPinPath('AB12CD34EF56GH78'),
      'https://portal.example.test'
    )

    expect(url.search).toBe('')
    expect(new URLSearchParams(url.hash.slice(1)).get('pin')).toBe(
      'AB12CD34EF56GH78'
    )
  })

  it('reads old query links and new fragment links', () => {
    expect(
      readEvaluationEntryCredentials(
        '?token=legacy-token&assignment=assignment-1',
        ''
      )
    ).toMatchObject({
      token: 'legacy-token',
      assignment: 'assignment-1',
      hasCredential: true
    })
    expect(
      readEvaluationEntryCredentials(
        '',
        '#token=new-token&assignment=assignment-2'
      )
    ).toMatchObject({
      token: 'new-token',
      assignment: 'assignment-2',
      hasCredential: true
    })
  })

  it('rejects duplicate credential parameters', () => {
    expect(
      readEvaluationEntryCredentials('?pin=first&pin=second', '#pin=third').pin
    ).toBeUndefined()
  })
})
