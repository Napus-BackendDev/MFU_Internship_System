import { describe, expect, it, vi } from 'vitest'

import {
  extractFontFamilyName,
  normalizeFontFamilyStack
} from '../src/documents/font-metadata.js'

describe('document font metadata', () => {
  it('normalizes family name extracted from the embedded font metadata', () => {
    const bytes = Uint8Array.of(1, 2, 3)
    const parser = vi.fn(() => ({ familyName: '  Sarabun  ' }))

    expect(extractFontFamilyName(bytes, parser)).toBe('Sarabun')
    expect(parser).toHaveBeenCalledWith(bytes)
  })

  it.each([null, '', '   ', 'Family\nInjected', 'F'.repeat(121)])(
    'rejects invalid extracted family metadata (%s)',
    (familyName) => {
      expect(() =>
        extractFontFamilyName(Uint8Array.of(1), () => ({ familyName }))
      ).toThrowError(
        expect.objectContaining({
          response: { code: 'DOCUMENT_ASSET_CONTENT_INVALID' },
          status: 422
        })
      )
    }
  )

  it('rejects a font file that fontkit cannot parse', () => {
    expect(() =>
      extractFontFamilyName(Uint8Array.of(0), () => {
        throw new Error('invalid font')
      })
    ).toThrowError(
      expect.objectContaining({
        response: { code: 'DOCUMENT_ASSET_CONTENT_INVALID' },
        status: 422
      })
    )
  })

  it('normalizes only first CSS family and preserves exact family identity', () => {
    expect(normalizeFontFamilyStack('"Sarabun", sans-serif')).toBe('sarabun')
    expect(normalizeFontFamilyStack('  Sarabun , serif')).toBe('sarabun')
    expect(normalizeFontFamilyStack('  ')).toBeUndefined()
  })
})
