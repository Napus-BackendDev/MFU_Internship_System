import { sanitizeEmailHtml } from '@internship/email-security'

const HTML_ENTITIES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}

export function renderSafeEmailHtml(
  template: string,
  values: Readonly<Record<string, string>>
): string {
  const rendered = template.replace(
    /{{\s*([a-z_]+)\s*}}/g,
    (_match, key: string) => {
      const value = values[key]
      if (value === undefined) throw new Error('UNKNOWN_TEMPLATE_PLACEHOLDER')
      return value.replace(/[&<>"']/g, (character) => HTML_ENTITIES[character]!)
    }
  )

  return sanitizeEmailHtml(rendered)
}
