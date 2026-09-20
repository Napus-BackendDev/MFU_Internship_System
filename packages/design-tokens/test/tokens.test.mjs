import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('MFU Internship tokens expose the semantic component contract', async () => {
  const css = await readFile(
    new URL('../src/theme.css', import.meta.url),
    'utf8'
  )

  assert.match(css, /--component-button-min-height:\s*2\.75rem/)
  assert.match(css, /--color-mfu-red-600:\s*#d2232a/)
  assert.match(css, /--color-mfu-red-800:\s*#8c1515/)
  assert.match(css, /--color-mfu-gold-400:\s*#fec260/)
  assert.match(css, /--semantic-focus-ring:\s*var\(--color-mfu-red-700\)/)
  assert.match(
    css,
    /--semantic-action-secondary:\s*var\(--color-mfu-gold-700\)/
  )
  assert.match(css, /--font-heading:/)
  assert.match(css, /Plus Jakarta Sans Variable/)
  assert.doesNotMatch(css, /--color-navy-/)
  assert.doesNotMatch(css, /--color-sage-/)
})
