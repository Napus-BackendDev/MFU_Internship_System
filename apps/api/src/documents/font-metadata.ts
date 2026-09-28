import fontkit from '@pdf-lib/fontkit'
import { UnprocessableEntityException } from '@nestjs/common'

interface FontMetadata {
  readonly familyName: string | null
}

type FontMetadataParser = (bytes: Uint8Array) => FontMetadata

const parseWithFontkit: FontMetadataParser = (bytes) => fontkit.create(bytes)

export function extractFontFamilyName(
  bytes: Uint8Array,
  parseFont: FontMetadataParser = parseWithFontkit
): string {
  let familyName: string | null
  try {
    familyName = parseFont(bytes).familyName
  } catch {
    throw new UnprocessableEntityException({
      code: 'DOCUMENT_ASSET_CONTENT_INVALID'
    })
  }

  const normalized = familyName?.normalize('NFC').trim()
  if (
    !normalized ||
    normalized.length > 120 ||
    [...normalized].some((character) => {
      const codePoint = character.codePointAt(0)
      return (
        codePoint !== undefined &&
        (codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f))
      )
    })
  ) {
    throw new UnprocessableEntityException({
      code: 'DOCUMENT_ASSET_CONTENT_INVALID'
    })
  }
  return normalized
}

export function normalizeFontFamilyStack(value: string): string | undefined {
  const first = value.split(',')[0]?.trim()
  if (!first) return undefined

  const quote = first[0]
  const family =
    (quote === '"' || quote === "'") && first.at(-1) === quote
      ? first.slice(1, -1).trim()
      : first
  const normalized = family.normalize('NFC').trim()
  return normalized ? normalized.toLocaleLowerCase('en-US') : undefined
}
