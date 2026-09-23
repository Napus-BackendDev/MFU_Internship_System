import { randomUUID } from 'node:crypto'

import sanitizeHtml from 'sanitize-html'

const ALLOWED_TAGS = [
  'a',
  'b',
  'blockquote',
  'br',
  'code',
  'div',
  'em',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'i',
  'li',
  'ol',
  'p',
  'pre',
  's',
  'span',
  'strong',
  'table',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'tr',
  'u',
  'ul'
]

const dimensionValue = '-?(?:\\d+\\.?\\d*|\\.\\d+)(?:px|pt|em|rem|%)?'
const dimension = new RegExp(`^${dimensionValue}$`, 'i')
const spacing = new RegExp(
  `^${dimensionValue}(?:\\s+${dimensionValue}){0,3}$`,
  'i'
)
const color =
  /^(?:#[\da-f]{3,8}|(?:rgb|rgba|hsl|hsla)\([\d.%\s,/-]+\)|[a-z]{1,20})$/i

const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ALLOWED_TAGS,
  allowedAttributes: {
    '*': ['style'],
    a: ['href', 'title'],
    td: ['colspan', 'rowspan'],
    th: ['colspan', 'rowspan']
  },
  allowedStyles: {
    '*': {
      'background-color': [color],
      border: [
        /^(?:none|\d+(?:\.\d+)?(?:px|pt)\s+(?:solid|dashed|dotted)\s+(?:#[\da-f]{3,8}|[a-z]{1,20})?)$/i
      ],
      'border-bottom': [
        /^(?:none|\d+(?:\.\d+)?(?:px|pt)\s+(?:solid|dashed|dotted)\s+(?:#[\da-f]{3,8}|[a-z]{1,20})?)$/i
      ],
      'border-collapse': [/^(?:collapse|separate)$/i],
      'border-radius': [/^(?:\d+(?:\.\d+)?(?:px|pt|em|rem|%)?|0)$/i],
      'border-top': [
        /^(?:none|\d+(?:\.\d+)?(?:px|pt)\s+(?:solid|dashed|dotted)\s+(?:#[\da-f]{3,8}|[a-z]{1,20})?)$/i
      ],
      color: [color],
      display: [/^(?:block|inline|inline-block)$/i],
      'font-family': [/^[\w\s,'"-]{1,160}$/],
      'font-size': [
        /^(?:\d+(?:\.\d+)?(?:px|pt|em|rem|%)|small|medium|large)$/i
      ],
      'font-style': [/^(?:normal|italic|oblique)$/i],
      'font-weight': [/^(?:normal|bold|[1-9]00)$/i],
      'line-height': [/^(?:normal|\d+(?:\.\d+)?(?:px|pt|em|rem|%)?)$/i],
      margin: [spacing],
      'margin-bottom': [dimension],
      'margin-left': [dimension],
      'margin-right': [dimension],
      'margin-top': [dimension],
      'max-width': [dimension],
      padding: [spacing],
      'padding-bottom': [dimension],
      'padding-left': [dimension],
      'padding-right': [dimension],
      'padding-top': [dimension],
      'text-align': [/^(?:left|right|center|justify)$/i],
      'text-decoration': [/^(?:none|underline|line-through)$/i],
      'vertical-align': [/^(?:top|middle|bottom)$/i],
      width: [dimension],
      'word-break': [/^(?:normal|break-all|keep-all)$/i],
      'white-space': [/^(?:normal|nowrap|pre-wrap)$/i]
    }
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowedSchemesAppliedToAttributes: ['href'],
  allowProtocolRelative: false,
  disallowedTagsMode: 'discard',
  nonTextTags: ['script', 'style', 'textarea', 'option'],
  parseStyleAttributes: true
}

const PLACEHOLDER_PATTERN = /{{\s*([a-z_]+)\s*}}/g

export function sanitizeEmailHtml(html: string): string {
  return sanitizeHtml(html, SANITIZE_OPTIONS)
}

export function sanitizeEmailTemplateHtml(html: string): string {
  const nonce = randomUUID().replaceAll('-', '')
  const placeholders = new Map<string, string>()
  let protectedHtml = html.replace(
    PLACEHOLDER_PATTERN,
    (_match, key: string) => {
      const marker =
        key === 'invitation_url'
          ? `https://template-placeholder.invalid/${nonce}/${key}`
          : `INTERNSHIPTEMPLATE${nonce}${key.toUpperCase()}`
      placeholders.set(marker, `{{${key}}}`)
      return marker
    }
  )

  const invitationMarker = `https://template-placeholder.invalid/${nonce}/invitation_url`
  protectedHtml = sanitizeHtml(protectedHtml, {
    ...SANITIZE_OPTIONS,
    transformTags: {
      a: (tagName, attributes) => {
        const href = attributes.href ?? ''
        if (
          (href.includes(`INTERNSHIPTEMPLATE${nonce}`) &&
            !href.includes('invitation_url')) ||
          (href.includes('template-placeholder.invalid') &&
            href !== invitationMarker)
        ) {
          delete attributes.href
        }
        return { tagName, attribs: attributes }
      }
    }
  })
  for (const [marker, placeholder] of placeholders) {
    protectedHtml = protectedHtml.replaceAll(marker, placeholder)
  }
  return protectedHtml
}
