import { readFile } from 'node:fs/promises'

const css = await readFile(new URL('../src/theme.css', import.meta.url), 'utf8')
const definitions = new Set(
  [...css.matchAll(/--([a-z0-9-]+)\s*:/g)].map((match) => match[1])
)
const references = new Set(
  [...css.matchAll(/var\(--([a-z0-9-]+)\)/g)].map((match) => match[1])
)
const missing = [...references].filter(
  (reference) => !definitions.has(reference)
)

if (missing.length > 0) {
  throw new Error(`Undefined design token references: ${missing.join(', ')}`)
}

if (!/@import\s+['"]@nuxt\/ui['"];/.test(css)) {
  throw new Error('Nuxt UI import is missing from theme.css.')
}

console.log(`Verified ${definitions.size} design token definitions.`)
